import { equals } from 'ramda'
import { Atomic, createMemo } from 'vait'
import cfg from '../../config'
import { getWindowId, WindowID } from './window'
import { alarmSetTimeout, alarmTask } from '../../utils/chrome-alarms'
import { ChromeEvent } from '../../utils/chrome-event'

function isFullscreenOrMaximized(win: chrome.windows.Window) {
  return win.state === 'fullscreen' || win.state === 'maximized'
}

function initRefocusLayout() {
  return createMemo(false)
}

enum Flags {
  REMOVED = 'REMOVED',
  BOUNDS = 'BOUNDS',
  FOCUS = 'FOCUS',
}

function Flag() {
  const init_value: Flags = Flags.FOCUS

  const [getFlag, setFlag] = createMemo<Flags>(Flags.FOCUS)
  const initFlag = () => setFlag(init_value)

  return [getFlag, setFlag, initFlag] as const
}

// 回避 Windows 的双次触发 focusChanged 事件
// ref: #101
function DoubleFocusProtect(
  { isLayout, isNone }: {
    isLayout: (id: WindowID) => boolean,
    isNone: (id: WindowID) => boolean,
  },
  callback: (true_id: WindowID) => void
) {
  type Callback = (id: WindowID) => void

  const [getReceived, setReceived] = createMemo<Array<WindowID>>([])
  const clearReceived = () => setReceived([])
  const appendReceived = (win_id: WindowID) => setReceived([...getReceived(), win_id])

  let alarm_task: ReturnType<typeof alarmTask> | undefined

  function dispatch(received: Array<WindowID>, callback: Callback) {
    const [first, second] = received
    if (received.length === 1) {
      callback(first)
    } else {
      if (isLayout(first) && isNone(second)) {
        callback(first)
      }
      else if (isLayout(second) && isNone(first)) {
        callback(second)
      }
      else {
        // [ None, None ]
        console.log('[ None, None ]')
        callback(chrome.windows.WINDOW_ID_NONE)
      }
    }
  }

  return (
    function focusChangedHandler(
      untrusted_focused_window_id: WindowID,
    ) {
      if (alarm_task === undefined) {
        alarm_task = alarmTask(
          cfg.WINDOWS_DOUBLE_FOCUS_WAITING_DURATION,
          () => {}
        )
      }

      appendReceived(untrusted_focused_window_id)

      const [insteadTask] = alarm_task

      insteadTask(() => {
        const received = getReceived()

        alarm_task = undefined
        clearReceived()

        dispatch(received, callback)
      })
    }
  )
}

/**
 * removed/focus/bounds 事件调度
 * 作为 onRemovedWindow、onSelectSearchWindow、onEnterFullscreenOrMaximized
 * 的代理。目的是让这三个更专注处理需求而不是关注事件调度
 * 
 * 关于事件调用，会有这些场景（右边括号的为事件的调用顺序）：
 *   1) 失焦的情况点击标题栏 ( focus )
 *   2) 失焦的情况点击全屏/最大化 ( focus -> bounds )
 *   3) 失焦的情况按住 Command 点击全屏/最大化 ( bounds )
 *   4) 没有失去焦点的时候点击全屏/最大化 ( bounds )
 *   5) 失去焦点的时候拖拽窗口边缘进行尺寸调整 ( focus -> bounds )
 *   6) 没有失去焦点的时候拖拽窗口边缘进行尺寸调整 ( bounds )
 *   7) 失去焦点的时候点击关闭按钮 ( focus -> removed )
 *   8) 没有失去焦点的时候点击关闭按钮 ( removed )
 *   9) 失焦的情况按住 Command 点击关闭按钮 ( removed )
 * 
 * 主要的麻烦点在于 2、5、7，他们是先执行 focus 后，才执行真正需要的事件
 * 我们需要保证调用顺序，该是选择窗口，还是最大化全屏，还是关闭，要做到
 * 这三个事件不会重复执行。
 * 
 * 对于 5，可以利用 isFullscreenOrMaximized 来过滤掉
 * 2 和 7 在下边利用信号触发机制（本质上事件传递、回调函数）来解决
 * 缺点是若 bounds 事件在 cfg.SEARCH_FOCUS_INTERVAL 毫秒后未触发的话
 * 就无法成功获得预期的效果。现在的计算机响应都够快，所以这种缺点还算是
 * 能够接受的。
 */
export function trustedSearchWindowEvents({
  getRegIds,
  control_window_id,
  platform,
  ...callbacks
}: {
  getRegIds(): WindowID[]
  control_window_id: WindowID
  platform: chrome.runtime.PlatformInfo

  onRemovedWindow(removed_window_id: WindowID): Promise<void>
  onSelectSearchWindow(
    focused_window_id: WindowID,
    RefocusLayout: ReturnType<typeof initRefocusLayout>
  ): Promise<void>,
  onEnterFullscreenOrMaximized(
    win: chrome.windows.Window,
    RefocusLayout: ReturnType<typeof initRefocusLayout>
  ): Promise<void>
}) {
  const isNone = equals<WindowID>(chrome.windows.WINDOW_ID_NONE)
  const isControlWindow = equals(control_window_id)
  const isSearchWindow = (id: WindowID) => getRegIds().indexOf(id) !== -1

  function isLayout(id: WindowID) {
    return (isControlWindow(id) || isSearchWindow(id)) && !isNone(id)
  }

  const [getFlag, setFlag, initFlag] = Flag()

  const RefocusLayout = initRefocusLayout()
  const [, shouldRefocusLayout] = RefocusLayout

  const routeProcessing = Atomic()
  type Route = {
    (route: Flags.BOUNDS, id: WindowID, win: chrome.windows.Window): void
    (route: Flags.REMOVED, id: WindowID): void
    (route: Flags.FOCUS, id: WindowID): void
  }
  const route: Route = (
    flag: Flags,
    window_id: WindowID,
    win?: chrome.windows.Window
  ) => {
    setFlag(flag)

    routeProcessing(async () => {
      if (flag === Flags.REMOVED) {
        return callbacks.onRemovedWindow(window_id).finally(() => {
          initFlag()
        })
      }
      else if ((flag === Flags.BOUNDS) && (win !== undefined)) {
        cancelAllEvent()
        return callbacks.onEnterFullscreenOrMaximized(win, RefocusLayout)
          .finally(() => {
            applyAllEvent()
            initFlag()
          })
      }
      else if (flag === Flags.FOCUS) {
        cancelFocusChanged()
        cancelBoundsChanged()
        return callbacks
          .onSelectSearchWindow(window_id, RefocusLayout)
          .finally(() => {
            shouldRefocusLayout(false)
            applyFocusChanged()
            applyBoundsChanged()
            initFlag()
          })
      }
    })
  }

  const removedHandler = (removed_window_id: WindowID) => {
    console.log('onRemoved')
    if (isSearchWindow(removed_window_id)) {
      route(Flags.REMOVED, removed_window_id)
    }
  }

  const focusChangedHandler = DoubleFocusProtect(
    { isLayout, isNone },
    (true_id) => {
      if (!isLayout(true_id)) {
        console.log('shouldRefocusLayout(true)')
        shouldRefocusLayout(true)
      } else {
        const flag = getFlag()

        console.log('doubleFocusProtect callback', true_id, flag)

        alarmSetTimeout(cfg.SEARCH_FOCUS_INTERVAL - cfg.WINDOWS_DOUBLE_FOCUS_WAITING_DURATION, () => {
          if (flag === Flags.FOCUS) {
            route(flag, true_id)
          }
        })
      }
    }
  )

  const boundsChangedHandler = (win: chrome.windows.Window) => {
    console.log('onBoundsChanged')
    const bounds_window_id = getWindowId(win)
    if (isSearchWindow(bounds_window_id)) {
      if (isFullscreenOrMaximized(win)) {
        route(Flags.BOUNDS, bounds_window_id, win)
      }
    }
  }

  const [ applyRemoved, cancelRemoved ] = ChromeEvent(chrome.windows.onRemoved, removedHandler)
  const [ applyFocusChanged, cancelFocusChanged ] = ChromeEvent(chrome.windows.onFocusChanged, focusChangedHandler)
  const [ applyBoundsChanged, cancelBoundsChanged ] = ChromeEvent(chrome.windows.onBoundsChanged, boundsChangedHandler)

  const applyAllEvent = () => {
    console.log('applyWindowsEvent')
    applyRemoved()
    applyFocusChanged()
    applyBoundsChanged()
  }

  const cancelAllEvent = () => {
    console.log('cancelWindowsEvent')
    cancelRemoved()
    cancelFocusChanged()
    cancelBoundsChanged()
  }

  return Object.freeze({
    applyAllEvent,
    cancelAllEvent,
  })
}
