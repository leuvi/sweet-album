# API 参考

[English](./api.md) | [简体中文](./api.zh-CN.md)

## `new SweetAlbum(container, options?)`

`container` 可以是 `HTMLElement`，也可以是 CSS 选择器字符串。相册会在其中追加
自己的根元素并填满它，因此**容器必须有高度**。

```js
const album = new SweetAlbum('#album', { data: photos })
```

## 配置项

### 数据

| 配置    | 类型                    | 默认值   | 说明                                        |
| ------- | ----------------------- | -------- | ------------------------------------------- |
| `data`  | `PhotoItem[] \| () => PhotoItem[] \| Promise<PhotoItem[]>` | — | 时间流数据。传函数时在挂载时调用一次。 |
| `order` | `'desc' \| 'asc'`       | `'desc'` | 倒序（新→旧）或正序。                       |

### 布局

| 配置              | 类型     | 默认值 | 说明                                                   |
| ----------------- | -------- | ------ | ------------------------------------------------------ |
| `gap`             | `number` | `4`    | 图片间距，px。                                         |
| `targetRowHeight` | `number` | 自适应 | 期望行高。实际行高会贴近它，但绝不为此拉伸图片。       |
| `headerHeight`    | `number` | `44`   | 日期分组头的高度，px。                                 |
| `groupSpacing`    | `number` | `20`   | 分组之间的垂直间距，px。                               |
| `overscan`        | `number` | `2`    | 视口上下各预渲染的行数。                               |

不设 `targetRowHeight` 时，它会跟着容器宽度走 —— `clamp(宽度 / 3, 120, 220)`，
这样手机上一行大约放三张，而不是一张半。显式设置则在任何宽度下都固定生效。

### 功能开关

| 配置         | 类型      | 默认值 | 说明                             |
| ------------ | --------- | ------ | -------------------------------- |
| `selectable` | `boolean` | `true` | 显示图片与日期头上的勾选圈。     |
| `favorite`   | `boolean` | `true` | 显示每张图左下角的收藏心。       |
| `header`     | `boolean` | `true` | 显示顶部栏（照片数 / 已选数）。  |
| `timeline`   | `boolean` | `true` | 显示右侧边缘的年/月刻度轴。      |

### 外观

| 配置       | 类型                | 默认值   | 说明                                          |
| ---------- | ------------------- | -------- | --------------------------------------------- |
| `locale`   | `'en' \| 'zh-CN'`   | `'en'`   | 内置语言包。                                  |
| `messages` | `Partial<Messages>` | —        | 覆盖单条文案，见 [国际化](./i18n.zh-CN.md)。 |
| `theme`    | `'dark' \| 'light'` | `'dark'` | 写入根元素的 `data-theme`。                   |

### 扩展钩子

| 配置               | 类型                                                 | 说明                                                    |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| `thumbUrl`         | `(item, size: { width, height }) => string`          | 依据排版后的实际尺寸返回对应规格的缩略图 URL。          |
| `badges`           | `(item) => TileBadge[] \| null \| false`             | 图片四角的自定义角标，见下。                            |
| `contextMenu`      | `(ctx) => MenuItem[] \| false`                       | 构建右键菜单，见 [右键菜单](./context-menu.zh-CN.md)。 |
| `selectionActions` | `ToolbarAction[] \| ((selected) => ToolbarAction[])` | 顶部栏的批量操作，见下。                                |
| `viewer`           | `ViewerOptions \| false`                             | 配置或关闭预览器，见 [预览器](./viewer.zh-CN.md)。     |

### 一定要提供真正的缩略图

这是性能上影响最大的一项。**列表绝不能加载原图。**

一个瓦片高 120–220px，而一张现代相机原片可能有 2500 万像素、
解码后约占 100MB 位图。把 `thumbUrl` 指向压缩后的资源，列表每张只需几十 KB；
指向原图，快速滚动就会耗尽内存把标签页搞崩。

```js
new SweetAlbum('#album', {
  // 来自你的数据，逐张指定：
  data: photos.map((p) => ({ ...p, thumbUrl: p.small, url: p.original })),

  // …或按排版后的实际尺寸推导，适合图片 CDN：
  thumbUrl: (item, { width, height }) =>
    `${item.url}?w=${Math.ceil(width * devicePixelRatio)}&fit=cover`,
})
```

`width` / `height` 要保持**原图**的尺寸 —— 布局需要真实宽高比，
预览器需要真实像素来做 1:1 缩放，变的只是字节数。
预览器加载的是 `url`，画质不受影响。

demo 在构建时生成缩略图，完整示例见 `scripts/gen-demo-manifest.mjs`
（112MB 原图 → 6MB 缩略图）。

### 图片四角与自定义角标

每张图有四个角，其中两个被内置控件占用：

```
┌─────────────────────────┐
│ ◯ 勾选          角标    │   左上 = 内置 · 右上 = 你的
│                         │
│ ♥ 收藏          角标    │   左下 = 内置 · 右下 = 你的
└─────────────────────────┘
```

右侧两个角留给你自己的标记 —— 实况图标、时长、分辨率、同步状态等：

```js
new SweetAlbum('#album', {
  badges: (item) => [
    item.live && {
      id: 'live',
      corner: 'topRight',
      content: '<svg viewBox="0 0 24 24" …/>', // SVG 字符串、元素，或纯文本
      title: '实况照片',
    },
    { id: 'size', corner: 'bottomRight', content: `${item.width}×${item.height}` },
  ].filter(Boolean),
})
```

```ts
type TileCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

interface TileBadge {
  id: string
  corner: TileCorner
  content: string | SVGElement | HTMLElement
  title?: string
  /** 你自己的类名，用于定制样式 */
  className?: string
  /** 设了它角标就变成按钮，点击时不会冒泡触发打开预览 */
  onClick?: (item: PhotoItem, ev: MouseEvent) => void
}
```

`badges` 只会对可视区内的图片调用，返回结果按 `corner:id` 做差分，
集合没变时滚动不产生任何开销。请保持它是纯函数 —— 不要有副作用或重计算。

左侧两个角也**可以**用，角标会和内置控件并排显示，
一般只在关掉 `selectable` / `favorite` 时才这么做。

### 批量操作

批量操作放在顶部栏，不在日期分组头上 —— 分组头只负责整天选中。
传函数可以让按钮文案带上当前选中数量。

```js
new SweetAlbum('#album', {
  selectionActions: (selected) => [
    {
      id: 'download',
      label: `下载 ${selected.length} 张`,
      icon: '<svg viewBox="0 0 24 24" …/>', // SVG 字符串或元素
      onClick: ({ selected, clearSelection }) => {
        download(selected)
        clearSelection()
      },
    },
    { id: 'delete', label: '删除', danger: true, onClick: ({ selected }) => remove(selected) },
  ],
})
```

```ts
interface ToolbarAction {
  id: string
  label: string
  icon?: string | SVGElement | HTMLElement
  disabled?: boolean
  danger?: boolean
  onClick: (ctx: { selected: PhotoItem[]; clearSelection: () => void }) => void
}
```

只有存在选中项时才会出现。窄屏下按钮文字会收起只留图标，整行可横向滚动。

### 回调

每个回调在事件总线上都有对应事件（见下方 `on`）。

| 配置                | 签名                                              |
| ------------------- | ------------------------------------------------- |
| `onItemClick`       | `(item, index, ev: MouseEvent) => void`           |
| `onSelectionChange` | `(ids, items) => void`                            |
| `onFavoriteToggle`  | `(item, favorite) => void \| Promise<unknown>`    |
| `onViewerOpen`      | `(item, index) => void`                           |
| `onViewerClose`     | `() => void`                                      |
| `onError`           | `(error: Error) => void`                          |

`onItemClick` 在预览器打开之前触发 —— 调用 `ev.preventDefault()` 可以阻止打开，
自己接管点击行为。

`onFavoriteToggle` 可以返回 Promise。心形会立刻翻转，如果该 Promise reject 则
自动回滚，并通过 `onError` 上报失败。

## 方法

### 数据

```ts
album.setData(data: DataSource): Promise<void>   // 替换整条时间流
album.getPhotos(): PhotoItem[]                   // 按显示顺序
album.refresh(): void                            // 强制重排
```

如果相册是在 `display: none` 的容器里创建的，容器显示出来之后调用一次 `refresh()`。

### 选择

```ts
album.getSelection(): PhotoItem[]
album.getSelectedIds(): (string | number)[]
album.setSelection(ids: (string | number)[]): void
album.selectAll(): void
album.clearSelection(): void
```

### 收藏

```ts
album.getFavorites(): (string | number)[]
album.setFavorite(id, favorite: boolean): void   // 不会触发 onFavoriteToggle
```

### 预览器

```ts
album.open(idOrIndex: string | number): void
album.closeViewer(): void
```

`open` 会先把参数当作照片 id 查找，找不到再当作时间流下标。

### 定位

```ts
album.scrollToIndex(index: number, behavior?: ScrollBehavior): void
album.scrollToDate(year: number, month?: number, day?: number, behavior?: ScrollBehavior): void
```

`scrollToDate` 跳到**离该日期最近**的那个分组，正序倒序都一样。日期落在时间流之外时
会停在最近的一端，而不是什么都不做 —— 所以 `scrollToDate(1990)` 会滚到你最早的照片。

### 配置

```ts
album.setLocale(locale: 'en' | 'zh-CN'): void
album.setTheme(theme: 'dark' | 'light'): void
album.setOptions(next: Partial<SweetAlbumOptions>): void
```

`setOptions` 在布局相关配置变化时会自动重排。

### 生命周期

```ts
const off = album.on('selectionChange', handler)
off()                              // 或 album.off('selectionChange', handler)
album.destroy()                    // 移除全部 DOM 与监听
```

## 事件

| 事件              | 参数                          |
| ----------------- | ----------------------------- |
| `ready`           | `{ count: number }`           |
| `itemClick`       | `item, index, MouseEvent`     |
| `selectionChange` | `ids, items`                  |
| `favoriteToggle`  | `item, favorite`              |
| `viewerOpen`      | `item, index`                 |
| `viewerClose`     | —                             |
| `error`           | `Error`                       |

## 触屏

无需额外配置即可在手机上使用：

| 手势                     | 作用                                       |
| ------------------------ | ------------------------------------------ |
| 长按照片（约 500ms）     | 唤起右键菜单（手指移动超过 10px 即取消）   |
| 点日期头上的圆圈         | 选中 / 取消整天                            |
| 预览器内左右滑动         | 下一张 / 上一张（未放大时）                |
| 预览器内双指捏合         | 以两指中点为锚点缩放                       |
| 预览器内双击             | 在适应窗口 ↔ 100% 之间切换                 |

行高随容器缩小，控件尺寸同步收窄。因为没有 hover 可以唤出任何东西，
可见性改由状态决定：**实心**的心表示这张已收藏才显示（空心的不显示，
否则每张图上都挂一颗心就是噪音）；勾选圈在产生选中项之后出现；
预览器的左右箭头隐藏，改用滑动。

由于触屏上空心心是隐藏的，如果你的用户需要在手机上收藏，
请在 `contextMenu` 里提供一项（长按即可唤起）。

## 键盘

预览器内：

| 按键        | 作用            |
| ----------- | --------------- |
| `Esc`       | 关闭            |
| `←` / `→`   | 上一张 / 下一张 |
| `+` / `-`   | 放大 / 缩小     |
| `0`         | 适应窗口        |
| `1`         | 原始尺寸（100%）|

## 导出的工具函数

布局与数据处理的原语也一并导出，便于测试或自定义渲染：

```ts
import {
  layoutJustified,
  groupByDay,
  normalize,
  parseTime,
  icons,
  locales,
  resolveMessages,
} from 'sweet-album'
```
