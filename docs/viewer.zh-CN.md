# 预览器

[English](./viewer.md) | [简体中文](./viewer.zh-CN.md)

点击照片打开全屏预览器。默认以 **contain** 方式打开：图片按原始宽高比缩放，
在先到边的那个方向上铺满窗口 —— 无论窗口是什么形状，都不会畸变。

用 `viewer: false` 可完全关闭；也可以自己控制打开：

```js
album.open(photoId) // 也可以传时间流下标
album.closeViewer()
```

## 交互

| 操作                  | 作用                             |
| --------------------- | -------------------------------- |
| 放大后拖动            | 平移（到图片边缘自动夹紧）       |
| 适应窗口时鼠标拖动    | 图片自由移动，松手后停在原地     |
| 适应窗口时触屏拖动    | 阻尼跟手；超过约 60px 切换上/下一张，否则回弹归位 |
| 滚轮 / 触控板         | 以光标为锚点缩放                 |
| 双指捏合              | 以两指中点为锚点缩放             |
| 左右滑动              | 下一张 / 上一张（仅在未放大时）  |
| 双击 / 双击屏幕       | 在「适应窗口」和 100% 之间切换   |
| `←` / `→`             | 上一张 / 下一张                  |
| `+` / `-`             | 放大 / 缩小                      |
| `0` / `1`             | 适应窗口 / 原始尺寸              |
| `Esc`、点击背景       | 关闭                             |

即使图片处于旋转状态，缩放锚点依然准确。

**`closeOnBackdrop` 默认为 `false`。** 画布本身是拖动区域，
从图片上按下、在图片外松开时，`click` 会落到画布上 ——
如果开着背景关闭，拖动过程中预览就被关掉了。
只有在你的用户不需要拖动时才建议打开；无论开关与否，
紧跟拖动之后的那次点击都会被忽略。`Esc` 和关闭按钮始终有效。

切换照片时直接换图，无过渡动画。

## 配置

```js
new SweetAlbum('#album', {
  viewer: {
    initialFit: 'contain', // 或 'no-upscale'：小图不放大超过 100%
    maxScale: 8,
    zoomStep: 1.25, // 每次点击按钮 / 每格滚轮
    preload: 1, // 前后各预加载几张
    arrows: true,
    closeOnBackdrop: false, // 默认关闭，见下方说明
    actions: [...],
  },
})
```

## 工具栏

底部居中的工具栏由一个数组拼装。字符串表示内置按钮，对象表示你自己的按钮，
可以任意混排、任意调序。

内置 id：`rotateLeft`、`rotateRight`、`zoomOut`、`zoomLevel`、`zoomIn`、
`actualSize`、`fit`、`divider`。

默认值为：

```js
;['rotateLeft', 'rotateRight', 'divider', 'zoomOut', 'zoomLevel', 'zoomIn', 'divider', 'actualSize', 'fit']
```

### 自定义操作

```js
viewer: {
  actions: [
    'rotateLeft',
    'rotateRight',
    'divider',
    'zoomOut',
    'zoomLevel',
    'zoomIn',
    'divider',
    {
      id: 'download',
      title: '下载',
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg>',
      onClick: ({ state, controls }) => {
        const a = document.createElement('a')
        a.href = state.item.url
        a.download = state.item.id
        a.click()
      },
    },
    {
      id: 'rotate-and-close',
      title: '旋转后关闭',
      icon: myIconElement,          // 也可以直接传 SVGElement
      onClick: ({ controls }) => {
        controls.rotate(90)
        controls.close()
      },
    },
  ]
}
```

`icon` 接受原始 SVG 字符串、`SVGElement` 或 `HTMLElement`。SVG 字符串里用
`currentColor`，按钮就会自动跟随主题配色。

### 操作上下文

```ts
interface ViewerState {
  item: PhotoItem
  index: number
  total: number
  scale: number
  rotation: number
  x: number
  y: number
}

interface ViewerControls {
  zoomIn(step?: number): void
  zoomOut(step?: number): void
  zoomTo(scale: number): void
  rotate(deltaDeg: number): void
  fit(): void
  actualSize(): void
  reset(): void
  next(): void
  prev(): void
  close(): void
  getState(): ViewerState
}
```

旋转时会重新适配窗口，因此竖图转成横向后依然完整可见，而不会溢出。
