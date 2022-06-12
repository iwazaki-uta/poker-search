import React, { useCallback, useEffect, useState } from 'react'
import { Atomic, nextTick } from 'vait'

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
import CreateSignal from '../../utils/signal'

import useCurrentWindowId from '../../hooks/useCurrentWindowId'
import useWindowFocus from '../../hooks/useWindowFocus'

import Loading from '../../components/Loading'
import ArrowButtonGroup from './components/ArrowGroup'
import SearchForm from '../../components/SearchForm'

import './Control.css'

type Control = Unpromise<ReturnType<typeof createSearchLayout>>

const controllProcessing = Atomic()

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

  const [controll, setControll] = useState<Control | null>(null)
  const [stop_creating_signal] = useState(CreateSignal<void>())
  const [creating_signal] = useState(CreateSignal<void>())

  const controlWindowId = useCurrentWindowId()

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
          if ((controlWindowId !== null) && (controll !== null)) {
            controll.cancelAllEvent()
            controll.refreshLayout([]).finally(() => {
              controll.applyAllEvent()
            })
          } else if (controlWindowId !== null) {
            chrome.windows.update(controlWindowId, { focused: true })
          }
        }
      }
    )
  }, [controlWindowId, controll])

  const closeAllSearchWindows = useCallback((con: Control) => {
    con.cancelAllEvent()
    return closeWindows(con.getRegIds())
  }, [])

  useEffect(function closeAllWindowBeforeExit() {
    const handler = () => {
      stop_creating_signal.trigger()
      if (controll !== null) {
        closeAllSearchWindows(controll)
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }, [closeAllSearchWindows, controll, stop_creating_signal])

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
      async onRemovedWindow() {
        window.close()
      },
    }).then(newControll => {
      setControll(newControll)
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

  useEffect(function controllEventsEffect() {
    if (controll !== null) {
      controll.applyAllEvent()
      return () => controll.cancelAllEvent()
    }
  }, [controll])

  useEffect(function openSearchWindows() {
    console.log('openSearchWindows', controlWindowId, submitedKeyword)
    if (controlWindowId !== null) {
      if (submitedKeyword !== false) {
        if (controll === null) {
          moveControlWindow(controlWindowId)
          refreshWindows(controlWindowId, submitedKeyword)
        }
      }
    }
  }, [controlWindowId, controll, moveControlWindow, refreshWindows, submitedKeyword])

  const changeRow = useCallback((type: 'previus' | 'next') => {
    console.log('changeRow', type, controll)
    if (!controll) {
      return
    }
    controllProcessing(async () => {
      try {
        controll.cancelAllEvent()

        const remainMatrix = [...controll.getMatrix()]
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

        controll.setMatrix(newMatrix)
      } finally {
        controll.applyAllEvent()
      }
    })
  }, [base, controll, focusControlWindow])

  useChangeRowShortcutKey({
    onPressUp: () => changeRow('previus'),
    onPressDown: () => changeRow('next'),
  })

  return (
    <div className="container">
      {isLoading ? <Loading /> : (
        <>
          <SearchForm
            keyword={keyword}
            keywordPlaceholder="请输入搜索词"
            setKeyword={setKeyword}
            submitButtonActive={windowIsFocus}
            onSubmit={({ keyword: newSearchKeyword }) => {
              console.log('onSubmit')
              if (validKeyword(newSearchKeyword)) {
                controllProcessing(async () => {
                  console.log('onSubmit', newSearchKeyword)
                  if (controll === null) {
                    submitKeyword(newSearchKeyword)
                  } else {
                    try {
                      setLoading(true)
                      await nextTick()
                      await Promise.all(closeAllSearchWindows(controll))
                    } finally {
                      setControll(() => {
                        submitKeyword(newSearchKeyword)
                        return null
                      })
                    }
                  }
                })
              }
            }}
          />
          <ArrowButtonGroup onClick={changeRow} />
        </>
      )}
    </div>
  )
}
export default ControlApp
