# 主题定制

[English](./theming.md) | [简体中文](./theming.zh-CN.md)

所有颜色和圆角都是 CSS 自定义属性。定制主题只需覆盖变量，不必和选择器较劲。

```js
new SweetAlbum('#album', { theme: 'light' }) // 或 'dark'（默认）
album.setTheme('dark') // 运行时切换
```

主题以 `data-theme` 写在相册根元素上。预览器和右键菜单虽然挂载到 `<body>`，
但会带上同一个属性，因此始终保持一致。

## 变量

在 `.sweet-album` 上覆盖即可（如果希望挂载到 body 的部分也跟着变，
一并覆盖 `.sp-viewer` / `.sp-menu`）：

```css
.sweet-album,
.sp-viewer,
.sp-menu {
  --sp-bg: #131313; /* 相册背景 */
  --sp-fg: #f2f2f2; /* 主文字 */
  --sp-fg-dim: #a8a8a8; /* 次要文字、刻度 */
  --sp-surface: #1f1f1f; /* 菜单、工具栏 */
  --sp-surface-hover: #2c2c2c;
  --sp-border: #333333;
  --sp-accent: #4c8dff; /* 选中态 */
  --sp-accent-fg: #ffffff; /* 选中态上的文字 */
  --sp-danger: #ff5b5b; /* 危险菜单项 */
  --sp-heart: #ffffff; /* 实心收藏心 */
  --sp-tile-bg: #1c1c1c; /* 图片占位底色 */
  --sp-scrim: rgba(0, 0, 0, 0.55); /* 控件后的渐变遮罩 */
  --sp-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  --sp-radius: 6px; /* 图片、菜单项 */
  --sp-radius-lg: 12px; /* 菜单容器 */
  --sp-overlay: #0b0b0b; /* 预览器背景（刻意做成不透明） */
  --sp-btn-scrim: rgba(0, 0, 0, 0.45); /* 预览器关闭/翻页按钮的底衬 */
  --sp-font: system-ui, sans-serif;
}
```

## 跟随系统

```css
@media (prefers-color-scheme: light) {
  .sweet-album {
    --sp-bg: #ffffff;
    --sp-fg: #1a1a1a;
    /* … */
  }
}
```

或者直接用媒体查询监听器驱动配置项：

```js
const mq = matchMedia('(prefers-color-scheme: light)')
album.setTheme(mq.matches ? 'light' : 'dark')
mq.addEventListener('change', (e) => album.setTheme(e.matches ? 'light' : 'dark'))
```

## 类名

如果变量不够用，这些类名是稳定的钩子：

| 类名                  | 对应元素                                             |
| --------------------- | ---------------------------------------------------- |
| `.sweet-album`       | 相册根元素（`data-theme`；有选中项时带 `.is-selecting`）|
| `.sp-toolbar`         | 顶部栏                                               |
| `.sp-toolbar__btn`    | 批量操作按钮（`.is-danger`）                         |
| `.sp-scroller`        | 滚动容器                                             |
| `.sp-content`         | 定位布局层                                           |
| `.sp-day`             | 日期分组头（`.is-all`、`.is-some`）                  |
| `.sp-tile`            | 照片瓦片（`.is-loaded`、`.is-selected`、`.is-error`）|
| `.sp-tile__check`     | 左上角勾选圈                                         |
| `.sp-tile__fav`       | 左下角收藏心（`.is-active`）                         |
| `.sp-tile__slot`      | 角标容器（`--topRight`、`--bottomRight` …）          |
| `.sp-tile__badge`     | 单个角标；可用 `TileBadge.className` 追加你的类名    |
| `.sp-timeline`        | 右侧年份刻度轴                                       |
| `.sp-timeline__line`  | 刻度轴的那条竖线                                     |
| `.sp-timeline__tick`  | 线上的年份标签                                       |
| `.sp-menu`            | 右键菜单                                             |
| `.sp-viewer`          | 全屏预览器                                           |
| `.sp-viewer__toolbar` | 预览器底部工具栏                                     |

## 布局密度

视觉节奏由配置项控制，不需要改 CSS：

```js
new SweetAlbum('#album', {
  gap: 8, // 更宽松
  targetRowHeight: 300, // 更大的图
  headerHeight: 52,
  groupSpacing: 32,
})
```
