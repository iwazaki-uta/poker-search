import React, { useCallback, useEffect, useState } from 'react'
import { Atomic, Lock, nextTick, Signal } from 'vait'

import cfg from '../../config'

import { ApplyChromeEvent } from '../../utils/chrome-event'
import getQuery from '../../utils/get-query'
import { validKeyword } from '../../utils/search'

import { Base } from '../../core/base'
import { Matrix } from '../../core/common'
import { createSearchLayout } from '../../core/layout'
import { renderMatrix } from '../../core/layout/render'
import { closeWindows, SearchWindow } from '../../core/layout/window'
import { calcControlWindowPos } from '../../core/layout/control-window'
import { MessageEvent } from '../../message'
import useControlLaunch from '../../hooks/useControlLaunch'

import useCurrentWindow from '../../hooks/useCurrentWindow'
import useWindowFocus from '../../hooks/useWindowFocus'
import useLaunchContextMenu from '../../hooks/useLaunchContextMenu'

import Loading from '../../components/Loading'
import ArrowButtonGroup from './components/ArrowGroup'
import SearchForm from '../../components/SearchForm'

import './Control.css'

type Control = Unpromise<ReturnType<typeof createSearchLayout>>

const controlProcessing = Atomic()

function useChangeRowShortcutKey(props: {
  onPressUp: () => void
  onPressDown: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        props.onPressUp()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        props.onPressDown()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [props])
}

const ControlApp: React.FC<{ base: Base }> = ({ base }) => {
  const windowIsFocus = useWindowFocus(true)
  const [isLoading, setLoading] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [submitedKeyword, submitKeyword] = useState<string | false>(false)

  const [control, setControl] = useState<Control | null>(null)
  const [stop_creating_signal] = useState(Signal<void>())
  const [creating_signal] = useState(Signal<void>())

  const controlWindowId = useCurrentWindow()?.windowId

  const focusControlWindow = useCallback(async () => {
    if (controlWindowId) {
      return chrome.windows.update(controlWindowId, { focused: true })
    }
  }, [controlWindowId])

  useEffect(function setSearchwordFromURL() {
    const searchWord = getQuery(cfg.CONTROL_QUERY_TEXT)
    if (searchWord !== null) {
      if (validKeyword(searchWord)) {
        submitKeyword(searchWord)
        setKeyword(searchWord)
      }
    }
  }, [])

  useEffect(function handleShortcutKey() {
    return ApplyChromeEvent(
      chrome.commands.onCommand,
      (command: string) => {
        if (command === 'focus-layout') {
          if ((controlWindowId !== undefined) && (control !== null)) {
            control.cancelAllEvent()
            control.refreshLayout([]).finally(() => {
              control.applyAllEvent()
            })
          } else if (controlWindowId !== undefined) {
            chrome.windows.update(controlWindowId, { focused: true })
          }
        }
      }
    )
  }, [controlWindowId, control])

  const cleanControl = useCallback(async (con: Control) => {
    con.cancelAllEvent()

    await Promise.all(closeWindows(con.getRegIds()))

    if (con.refocus_window_id !== undefined) {
      await Promise.all(closeWindows([con.refocus_window_id]))
    }
  }, [])

  useEffect(function closeAllWindowBeforeUnload() {
    const handler = () => {
      stop_creating_signal.trigger()
      if (control !== null) {
        cleanControl(control)
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }, [cleanControl, control, stop_creating_signal])

  const moveControlWindow = useCallback(async (id: number) => {
    const [ top, left ] = calcControlWindowPos(base.layout_height, base.limit)
    await chrome.windows.update(id, { top, left })
  }, [base.layout_height, base.limit])

  const refreshWindows = useCallback((control_window_id: number, keyword: string) => {
    console.log('refreshWindows')
    setLoading(true)

    const closeHandler = () => {
      stop_creating_signal.trigger()
      window.close()
    }
    creating_signal.receive(closeHandler)

    createSearchLayout({
      control_window_id,
      base,
      keyword,
      stop_creating_signal,
      creating_signal,
      onRefocusLayoutClose() {
        window.close()
        const [neverResolve] = Lock<void>()
        return neverResolve
      },
      onRemovedWindow() {
        window.close()
        const [neverResolve] = Lock<void>()
        return neverResolve
      },
    }).then(newControl => {
      setControl(newControl)
    }).catch(err => {
      if (err.cancel) {
        // 提前取消
        console.log('提前取消')
      } else {
        console.error('createSearchLayout error', err)
        throw err
      }
    }).finally(() => {
      creating_signal.unReceive(closeHandler)
      setLoading(false)
      focusControlWindow()
    })
  }, [base, creating_signal, focusControlWindow, stop_creating_signal])

  useEffect(function controlEventsEffect() {
    if (control !== null) {
      control.applyAllEvent()
      return () => control.cancelAllEvent()
    }
  }, [control])

  useEffect(function openSearchWindows() {
    console.log('openSearchWindows', controlWindowId, submitedKeyword)
    if (controlWindowId !== undefined) {
      if (submitedKeyword !== false) {
        if (control === null) {
          moveControlWindow(controlWindowId)
          refreshWindows(controlWindowId, submitedKeyword)
        }
      }
    }
  }, [controlWindowId, control, moveControlWindow, refreshWindows, submitedKeyword])

  const changeRow = useCallback((type: 'previus' | 'next') => {
    console.log('changeRow', type, control)
    if (!control) {
      return
    }
    controlProcessing(async () => {
      try {
        control.cancelAllEvent()

        const remainMatrix = [...control.getMatrix()]
        const latestRow = type === 'next' ? remainMatrix.pop() : remainMatrix.shift()

        let newMatrix: Matrix<SearchWindow>

        if (latestRow === undefined) {
          throw Error('latestRow is undefined')
        } else if (type === 'next') {
          newMatrix = [latestRow, ...remainMatrix]
        } else {
          newMatrix = [...remainMatrix, latestRow]
        }

        await renderMatrix(
          base,
          newMatrix,
          type === 'next' ? true : undefined,
          true
        )

        await focusControlWindow()

        control.setMatrix(newMatrix)
      } finally {
        control.applyAllEvent()
      }
    })
  }, [base, control, focusControlWindow])

  useChangeRowShortcutKey({
    onPressUp: () => changeRow('previus'),
    onPressDown: () => changeRow('next'),
  })

  const handleSubmit = useCallback((newSearchKeyword: string) => {
    console.log('onSubmit')
    if (validKeyword(newSearchKeyword)) {
      controlProcessing(async () => {
        console.log('onSubmit', newSearchKeyword)
        if (control === null) {
          submitKeyword(newSearchKeyword)
        } else {
          try {
            setLoading(true)
            await nextTick()
            await cleanControl(control)
          } finally {
            setControl(() => {
              submitKeyword(newSearchKeyword)
              return null
            })
          }
        }
      })
    }
  }, [cleanControl, control])

  useEffect(function receiveChangeSearchMessage() {
    const [ applyReceive, cancelReceive ] = MessageEvent('ChangeSearch', (new_keyword) => {
      control?.cancelAllEvent()

      if (controlWindowId !== undefined) {
        chrome.windows.update(controlWindowId, { focused: true }).then(() => {
          handleSubmit(new_keyword)
        })
      }
    })
    applyReceive()

    return cancelReceive
  }, [controlWindowId, control, handleSubmit])

  useLaunchContextMenu(base.preferences)
  useControlLaunch()

  return (
    <div className="container">
      {isLoading ? <Loading /> : (
        <>
          <SearchForm
            keyword={keyword}
            keywordPlaceholder={`请输入搜索词`}
            setKeyword={setKeyword}
            submitButtonActive={windowIsFocus}
            onSubmit={({ keyword }) => {
              handleSubmit(keyword)
            }}
          />
          <ArrowButtonGroup onClick={changeRow} />
        </>
      )}
    </div>
  )
}
export default ControlApp
