import { compose, equals, prop } from 'ramda'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import cfg from '../../config'

import { Base } from '../../core/base'
import { calcControlWindowPos } from '../../core/layout/control-window'
import { WindowID } from '../../core/layout/window'
import { MessageEvent } from '../../message'

import getQuery from '../../utils/get-query'
import { validKeyword } from '../../utils/search'
import animatingWindow from '../../utils/animating-window'

import useWindowFocus from '../../hooks/useWindowFocus'
import useControl from '../../hooks/useControl'
import useReFocusMessage from '../../hooks/useReFocusMessage'

import Loading from '../../components/Loading'
import SearchForm from '../../components/SearchForm'
import ArrowButtonGroup from './components/ArrowGroup'
import FloorFilter from '../../components/FloorFilter'

import BGSrc from '../../assets/control-bg.png'

import './Control.css'
import useSelectedFloorIdx from '../../components/FloorFilter/useSelectedFloorIdx'

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

const ControlApp: React.FC<{
  base: Base
  controlWindowId: WindowID
  onSelectedFloorChange: (f: number[]) => void
}> = ({ base, controlWindowId, onSelectedFloorChange }) => {
  const [keywordInput, setKeywordInput] = useState('')
  const [submitedKeyword, submitKeyword] = useState<string | false>(false)

  const [selected_floor_idx, setSelectedFloorIdx] = useSelectedFloorIdx(base)

  const [disable_search, setDisableSearch] = useState<boolean>(
    !base.filtered_site_settings.length
  )
  useEffect(() => {
    setDisableSearch(!base.filtered_site_settings.length)
  }, [base.filtered_site_settings.length])

  const windowIsFocus = useWindowFocus(true)

  const {
    isLoading,
    setLoading,
    control,
    setControl,
    cleanControl,
    refreshWindows,
    changeRow: controlChangeRow,
    controlProcessing,
  } = useControl(base)

  const focusControlWindow = useCallback(async () => {
    return chrome.windows.update(controlWindowId, { focused: true })
  }, [controlWindowId])

  useReFocusMessage(controlWindowId, control)

  const moveControlWindow = useCallback(async (id: WindowID) => {
    const [ top, left ] = calcControlWindowPos(
      base.control_window_height,
      base.layout_height,
      base.limit
    )
    const win = await chrome.windows.get(id)

    const not_move = equals(
      [win.top, win.left, win.height],
      [top, left, base.control_window_height]
    )

    if (!not_move) {
      await animatingWindow(id, 382, {
        top: win.top,
        left: win.left,
        height: win.height,
      }, {
        top,
        left,
        height: base.control_window_height,
      })
    }
  }, [base.control_window_height, base.layout_height, base.limit])

  function changeRow(act: 'previus' | 'next') {
    controlChangeRow(act).then(focusControlWindow)
  }
  useChangeRowShortcutKey({
    onPressUp: () => changeRow('previus'),
    onPressDown: () => changeRow('next')
  })

  useEffect(function openSearchWindows() {
    console.log('openSearchWindows', controlWindowId, submitedKeyword)
    if (submitedKeyword !== false) {
      if (control === null) {
        refreshWindows(controlWindowId, submitedKeyword).finally(() => {
          focusControlWindow()
        })
      }
    }
  }, [cleanControl, control, controlWindowId, focusControlWindow, refreshWindows, submitedKeyword])

  useEffect(function focusControlWindowAfterLoad() {
    focusControlWindow()
  }, [focusControlWindow])

  useEffect(function setSearchwordFromURL() {
    const searchWord = getQuery(cfg.CONTROL_QUERY_TEXT)
    if (searchWord !== null) {
      if (validKeyword(searchWord)) {
        submitKeyword(searchWord)
        setKeywordInput(searchWord)
      }
    }
  }, [])

  const handleSubmit = useCallback((newSearchKeyword: string) => {
    console.log('onSubmit')
    if (validKeyword(newSearchKeyword)) {
      setKeywordInput(newSearchKeyword)

      controlProcessing(async () => {
        console.log('onSubmit', newSearchKeyword)
        setLoading(true)
        if (control) {
          await cleanControl(control)
        }
        moveControlWindow(controlWindowId).then(() => {
          setControl(() => {
            // 写成这样是处理提交同样搜索词的时候的处理
            // 因为是用 useEffect 来判断的，如果是相同的值就不会触发更新了
            submitKeyword(newSearchKeyword)
            return null
          })
        })
      })
    }
  }, [cleanControl, control, controlProcessing, controlWindowId, moveControlWindow, setControl, setLoading])

  useEffect(function receiveChangeSearchMessage() {
    const [ applyReceive, cancelReceive ] = MessageEvent('ChangeSearch', (new_keyword) => {
      control?.cancelAllEvent()

      chrome.windows.update(controlWindowId, { focused: true }).then(() => {
        handleSubmit(new_keyword)
      })
    })
    applyReceive()

    return cancelReceive
  }, [controlWindowId, control, handleSubmit])

  const searchFormNode = useMemo(() => {
    if (disable_search) {
      return (
        <SearchForm
          keywordPlaceholder={'请选择至少一层的站点配置'}
          keyword={''}
          setKeyword={() => {}}
          submitButtonActive={windowIsFocus}
          onSubmit={() => {}}
        />
      )
    } else {
      return (
        <SearchForm
          keywordPlaceholder={'请输入搜索词'}
          keyword={keywordInput}
          setKeyword={setKeywordInput}
          submitButtonActive={windowIsFocus}
          onSubmit={
            compose(
              handleSubmit,
              prop<'keyword', string>('keyword')
            )
          }
        />
      )
    }
  }, [disable_search, handleSubmit, keywordInput, windowIsFocus])

  return (
    <main className="control-main" style={{ background: `url(${BGSrc})` }}>
      {isLoading ? <Loading /> : (
        <>
          {searchFormNode}

          <div className="button-group-wrapper">
            <ArrowButtonGroup onClick={changeRow} />
          </div>

          <div className="floor-filter-wrapper">
            <FloorFilter
              siteSettings={base.preferences.site_settings}
              selectedFloors={selected_floor_idx}
              totalFloor={base.preferences.site_settings.length}
              onChange={(filtered) => {
                console.log('filtered onChange', filtered)
                onSelectedFloorChange(filtered)
                setSelectedFloorIdx(filtered)
              }}
            />
          </div>
        </>
      )}
    </main>
  )
}
export default ControlApp
