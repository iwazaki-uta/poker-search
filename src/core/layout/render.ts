import { Base } from '../base'
import { Matrix } from '../common'
import { calcRealPos } from './pos'
import { isCurrentRow } from './matrix'
import { SearchWindow } from './window'

async function refreshWindow(
  base: Base,
  opts: {
    window: SearchWindow,
    // windowId: number,
    focused?: boolean,
    resetSize?: boolean
    row: number
    col: number
  }
): Promise<void> {
  const [left, top] = calcRealPos(base, opts.row, opts.col)

  const { state, windowId } = opts.window
  if (state === 'EMPTY') {
    return
  } else {
    await chrome.windows.update(windowId, {
      focused: opts.focused,
      left,
      top,
      width: opts.resetSize ? base.info.window_width : undefined,
      height: opts.resetSize ? base.info.window_height : undefined,
    })
    return
  }
}

export async function renderMatrix(
  base: Base,
  matrix: Matrix<SearchWindow>,
  presetFocused: undefined | boolean = undefined,
  resetSize: boolean = false,
  skip_ids: number[] = []
) {
  const isWin = base.platform.os === 'win'

  const promises: Promise<void>[] = []
  for (let [row, line] of matrix.entries()) {
    for (let [col, win] of line.entries()) {
      const isLastLine = isCurrentRow(matrix, row)

      if (skip_ids.indexOf(win.windowId) !== -1) {
        promises.push(Promise.resolve(undefined))
      } else {
        const p = refreshWindow(base, {
          window: win,
          focused: (presetFocused === undefined) ? (isWin || isLastLine) : presetFocused,
          resetSize,
          row,
          col,
        })
        promises.push(p)
      }
    }
  }

  return Promise.all(promises)
}

export function renderCol(
  base: Base,
  matrix: Matrix<SearchWindow>,
  selectCol: number,
  presetFocused: undefined | boolean = undefined,
  resetSize: boolean = false
) {
  const isWin = base.platform.os === 'win'

  const promises: Promise<void>[] = []
  for (let [row, line] of matrix.entries()) {
    for (let [col, win] of line.entries()) {
      if (selectCol === col) {
        const isLastLine = isCurrentRow(matrix, row)
        const p = refreshWindow(base, {
          window: win,
          focused: (presetFocused === undefined) ? (isWin || isLastLine) : presetFocused,
          resetSize,
          row,
          col
        })
        promises.push(p)
      }
    }
  }

  return Promise.all(promises)
}
