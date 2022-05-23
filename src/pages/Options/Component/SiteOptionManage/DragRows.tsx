import { all, compose, equals, insert, move, nth, remove, update } from 'ramda'
import React from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  DraggingStyle,
  NotDraggingStyle,
  DraggableLocation,
  SensorAPI
} from 'react-beautiful-dnd'
import Cols from './DragCols'
import { SiteMatrix, SiteOption } from '../../../../preferences/site-matrix'
import SettingItem from '../SettingItem'
import s from './DragRows.module.css'
import WarningLine from './WarningLine'

const getRowListStyle = (isDraggingOver: boolean): React.CSSProperties => ({
  // background: isDraggingOver ? "lightblue" : "lightgrey",
  // padding: 8,
  // width: "480px"
})

const getItemStyle = (
  isDragging: boolean,
  draggableStyle: DraggingStyle | NotDraggingStyle | undefined
): React.CSSProperties => {
  return {
    userSelect: "none",
    // margin: `0 0 ${grid}px 0`,
    // margin: 0,

    background: isDragging ? "lightgreen" : "",

    ...draggableStyle
  }
}

function reorderCols(
  site_matrix: SiteMatrix,
  source: DraggableLocation,
  destination: DraggableLocation,
): SiteMatrix {
  const s_row = Number(source.droppableId)
  const d_row = Number(destination.droppableId)
  const row_src = nth(s_row, site_matrix)
  const row_des = nth(d_row, site_matrix)

  const s_col = source.index
  const d_col = destination.index

  if ((row_src === undefined) || (row_des === undefined)) {
    throw Error('row_src/row_des not found!')
  }
  else if (s_row === d_row) {
    const new_row = move(s_col, d_col, row_src)
    return update(s_row, new_row, site_matrix)
  }
  else {
    const col_src = nth(s_col, row_src)
    if (col_src === undefined) {
      throw Error('col_src not found')
    } else {
      return compose(
        update(s_row, remove(s_col, 1, row_src)),
        update(d_row, insert(d_col, col_src, row_des)),
      )(site_matrix)
    }
  }
}

const ROW_DROP = 'ROW_DROP'
const isRowDrop = all(equals(ROW_DROP))

function reorderRows(
  siteMatrix: SiteMatrix,
  source: DraggableLocation,
  destination: DraggableLocation,
): SiteMatrix {
  if (!isRowDrop([source.droppableId, destination.droppableId])) {
    throw new Error('current drop is not ROW_DROP')
  } else {
    const sRowNum = Number(source.index)
    const dRowNum = Number(destination.index)
    return move(sRowNum, dRowNum, siteMatrix)
  }
}

function dragNewRowArea(
  site_matrix: SiteMatrix,
  source: DraggableLocation,
): SiteMatrix {
  const s_row = Number(source.droppableId)
  return reorderCols(
    [
      [],
      ...site_matrix
    ],
    { droppableId: `${s_row + 1}`, index: source.index, },
    { droppableId: '0', index: 0, },
  )
}

type Pos = Readonly<[number, number]>

type DragMatrixProps = {
  edit: Pos | null,
  setEdit: React.Dispatch<React.SetStateAction<Pos | null>>
  siteMatrix: SiteMatrix
  onUpdate: (id: SiteOption['id'], newOption: SiteOption) => void
  onChange: (s: SiteMatrix) => void
  onClickAdd: (rowNum: number) => void
}
export default function DragRows({
  edit,
  setEdit,
  siteMatrix,
  onUpdate,
  onChange,
  onClickAdd,
}: DragMatrixProps) {
  const onDragEnd = ({ type, source, destination }: DropResult) => {
    if (!destination) {
      // no change
    } else if (type === "ROWS") {
      const newMatrix = reorderRows(siteMatrix, source, destination)
      onChange(newMatrix)
    } else if (type === 'COLS') {
      if (destination.droppableId === '-1') {
        const newMatrix = dragNewRowArea(siteMatrix, source)
        onChange(newMatrix)
      } else {
        const newMatrix = reorderCols(siteMatrix, source, destination)
        onChange(newMatrix)
      }
    } else {
      throw Error('unknown result.type')
    }
  }

  function useMyCoolSensor(api: SensorAPI) {
    Object.assign(window, { api })
  }

  function handleDragUpdate(...args: any[]) {
    console.log(...args)
  }

  return (
    <div className={s.DragRows}>
      <DragDropContext onDragEnd={onDragEnd} sensors={[useMyCoolSensor]} onDragUpdate={handleDragUpdate}>
        <div className={s.DragDropContextInner}>
          <Droppable droppableId={ROW_DROP} type="ROWS">
            {(provided, rowSnapshot) => (
              <div
                ref={provided.innerRef}
                style={getRowListStyle(rowSnapshot.isDraggingOver)}
              >
                <div
                  ref={provided.innerRef}
                  className={s.DragRowDnD}
                >
                  <SettingItem className={s.RowSettingItem} disableMargin>
                    <div className={s.DragRowInner}>
                      <div style={{ visibility: 'hidden' }}>
                        <div className={s.Handler}>
                          <div className={s.HandlerLine}></div>
                          <div className={s.HandlerLine}></div>
                          <div className={s.HandlerLine}></div>
                        </div>
                      </div>
                      <Cols
                        rowNum={-1}
                        row={[]}
                        edit={edit}
                        isEditMode={Boolean(edit)}
                        onChange={(id, newOption) => {
                          // onUpdate(id, newOption)
                        }}
                        onSubmitEdit={() => {}}
                        onClickEdit={() => {}}
                        onCancelEdit={() => {}}
                        onClickRemove={() => {}}
                        onClickAdd={() => {
                          // onClickAdd(rowNum)
                        }}
                      />
                    </div>
                  </SettingItem>
                </div>
                {siteMatrix.map((row, rowNum) => (
                  <Draggable key={rowNum} draggableId={`${rowNum}`} index={rowNum} isDragDisabled={Boolean(edit)}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={s.DragRowDnD}
                        style={getItemStyle(
                          snapshot.isDragging,
                          provided.draggableProps.style
                        )}
                      >
                        <SettingItem className={s.RowSettingItem} disableMargin>
                          <div className={s.DragRowInner}>
                            <div {...provided.dragHandleProps}>
                              <div className={s.Handler}>
                                <div className={s.HandlerLine}></div>
                                <div className={s.HandlerLine}></div>
                                <div className={s.HandlerLine}></div>
                              </div>
                            </div>
                            <Cols
                              rowNum={rowNum}
                              row={row}
                              edit={edit}
                              isEditMode={Boolean(edit)}
                              onChange={(id, newOption) => {
                                onUpdate(id, newOption)
                              }}
                              onSubmitEdit={(colNum, newOption) => {
                                const newRow = update(colNum, newOption, row)
                                const newMatrix = update(rowNum, newRow, siteMatrix)
                                onChange(newMatrix)
                                setEdit(null)
                              }}
                              onClickEdit={(colNum) => {
                                console.log('onClickEdit')
                                setEdit([rowNum, colNum])
                              }}
                              onCancelEdit={() => {
                                setEdit(null)
                              }}
                              onClickRemove={(colNum) => {
                                const newRow = remove(colNum, 1, row)
                                const newMatrix = update(rowNum, newRow, siteMatrix)
                                onChange(newMatrix)
                              }}
                              onClickAdd={() => onClickAdd(rowNum)}
                            />
                          </div>
                          <div className={`${s.Floor} ${rowSnapshot.isDraggingOver ? s.isDraggingOver : ''}`}>{siteMatrix.length - (rowNum + 1) + 1}F</div>
                        </SettingItem>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          <WarningLine disable={Boolean(edit)} siteMatrix={siteMatrix} />
        </div>
      </DragDropContext>
      <div className={s._1FTips}>⬆ 使用 Poker 后，最先展示的层</div>
    </div>
  )
}
