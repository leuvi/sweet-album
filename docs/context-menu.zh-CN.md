# 右键菜单

[English](./context-menu.md) | [简体中文](./context-menu.zh-CN.md)

sweet-album **不预置任何**菜单项。库只负责定位、边缘翻转、键盘处理和关闭，
菜单内容完全由你决定。

菜单只有**一级**，没有二级子菜单。批量操作请放到顶部栏，
用 [`selectionActions`](./api.zh-CN.md#批量操作) 配置。

返回 `false`（或空数组）即可对某个目标不显示菜单 —— 此时浏览器原生菜单照常弹出。

```js
new SweetAlbum('#album', {
  data: photos,
  contextMenu: ({ item, selected, close }) => {
    if (!item) return false

    // 右键的这张若在选中集里，就对整个选中集操作
    const inSelection = selected.some((p) => p.id === item.id)
    const targets = inSelection && selected.length > 1 ? selected : [item]

    return [
      { id: 'open', label: '打开', onClick: () => location.assign(item.url) },
      { id: 'copy', label: '复制链接', onClick: () => copy(targets) },
      { id: 'sep', label: '', divider: true },
      {
        id: 'delete',
        label: `删除 ${targets.length} 张`,
        danger: true,
        onClick: () => remove(targets),
      },
    ]
  },
})
```

## 在哪里唤起

- 在照片上**右键**。
- 触屏设备上在照片上**长按**（约 500ms）。手指移动超过 10px 即取消，
  所以滑动滚动不会误触发；长按后紧跟的那次 tap 也会被吞掉，不会顺带打开预览器。
- **日期分组头没有右键菜单**。它只负责整天选中，随之出现的批量操作在顶部栏。

## 上下文对象

```ts
interface ContextMenuContext {
  /** 光标下的照片；在别处唤起菜单时为 null */
  item: PhotoItem | null
  /** 当前选中项，按时间流顺序 */
  selected: PhotoItem[]
  /** 以编程方式关闭菜单 */
  close: () => void
}
```

## 菜单项

```ts
interface MenuItem {
  id: string
  label: string
  /** 原始 SVG 字符串，或已有的 SVGElement / HTMLElement */
  icon?: string | SVGElement | HTMLElement
  disabled?: boolean
  /** 以危险色渲染 */
  danger?: boolean
  /** 渲染为分隔线，其他字段全部忽略 */
  divider?: boolean
  onClick?: (ctx: ContextMenuContext) => void
}
```

图标就是普通 SVG 字符串 —— 用 `currentColor` 让它跟随主题：

```js
{
  id: 'star',
  label: '标记',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  onClick: ({ selected }) => star(selected),
}
```

也可以直接传 `SVGElement` / `HTMLElement`，库会原样挂载。内置图标集一并导出，
方便你保持视觉一致：

```js
import { icons } from 'sweet-album'
// icons.heart、icons.check、icons.close、icons.zoomIn …
```

## 行为

- 在光标处弹出；空间不够时自动水平或垂直翻转。
- `Esc`、点击外部、窗口 resize、页面滚动都会关闭。
- `onClick` 在菜单**关闭之后**才触发，因此你可以放心地在里面打开自己的弹窗，
  不会和关闭逻辑打架。
- 在没有 hover 能力的设备上，菜单行会自动加大点击区域。
