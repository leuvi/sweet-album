# sweet-album

一个与框架无关的 Web 相册组件：单一、连续、按天分组的照片时间流，自适应正列布局、
虚拟滚动、全屏预览。

一个包同时服务 **原生 JS**、**React** 和 **Vue 3**。库本身不做任何请求，也不假设后端
形态 —— 你把照片给它，它负责渲染。

[English](./README.md) | 简体中文

---

## 特性

- **正列布局（justified）** —— 每行铺满容器宽度，每张图严格保持原始宽高比，
  永远不会被拉伸或压扁。
- **虚拟滚动** —— DOM 中只存在可视区那一小片，节点循环复用。10 万张照片的
  时间流与 100 张的开销相同。
- **响应式** —— `ResizeObserver` 监听容器尺寸变化后重排，并把你正在看的那张
  照片锚定在原位，不跳动。
- **按天分组** —— 每个日历日一个分组头；右侧边缘还有一条年/月刻度轴，
  一次拖动即可跨越十年。
- **选择** —— 单张勾选，外加每个日期头上的三态圆圈，一键选中或取消整天；
  你定义的批量操作出现在顶部栏。
- **收藏** —— 每张图左下角一颗心，乐观更新；你的处理函数 reject 时自动回滚。
- **右键菜单** —— 完全由使用方定义，只有一级。库只负责定位、边缘翻转和关闭，
  菜单项一条都不预置；触屏上长按唤起。
- **移动端就绪** —— 行高随容器缩放，无 hover 时点击区域自动加大，
  预览器内左右滑动切图、双指捏合缩放。
- **预览器** —— 默认按 contain 打开（按原始分辨率横向或纵向铺满窗口，不畸变），
  可拖动平移、滚轮以光标为锚点缩放、触屏双指捏合、上一张/下一张，
  底部工具栏可用你自己的 SVG 图标扩展。
- **国际化与主题** —— 内置英文（默认）与简体中文，任意文案可覆盖；
  深色/浅色主题全部由 CSS 变量驱动。
- **类型完备** —— TypeScript 编写，自带类型声明。

## 安装

```bash
npm install sweet-album
```

```bash
pnpm add sweet-album
```

## 快速开始

### 原生 JS

```js
import { SweetAlbum } from 'sweet-album'
import 'sweet-album/style.css'

const album = new SweetAlbum('#album', {
  // 数组，或任意返回数组的（异步）函数
  data: async () => (await fetch('/api/photos')).json(),
  locale: 'zh-CN',
  theme: 'dark',
})

album.on('selectionChange', (ids) => console.log(ids))
```

容器需要有高度，相册会把它填满：

```css
#album {
  height: 100vh;
}
```

### React

```tsx
import { useRef } from 'react'
import { SweetAlbum, type SweetAlbumHandle } from 'sweet-album/react'
import 'sweet-album/style.css'

export function Gallery({ photos }) {
  const album = useRef<SweetAlbumHandle>(null)

  return (
    <SweetAlbum
      ref={album}
      style={{ height: '100vh' }}
      data={photos}
      locale="zh-CN"
      onSelectionChange={(ids, items) => console.log(ids, items)}
      onFavoriteToggle={(item, favorite) => api.setFavorite(item.id, favorite)}
    />
  )
}
```

回调类的 props 通过 ref 读取，因此直接写内联箭头函数也不会导致相册重建。

### Vue 3

```vue
<script setup>
import { ref } from 'vue'
import { SweetAlbum } from 'sweet-album/vue'
import 'sweet-album/style.css'

const photos = ref([])
const selection = ref([])
</script>

<template>
  <SweetAlbum
    style="height: 100vh"
    :data="photos"
    locale="zh-CN"
    v-model:selection="selection"
    @favorite-toggle="(item, fav) => api.setFavorite(item.id, fav)"
  />
</template>
```

也可以全局注册：

```js
import { SweetAlbumPlugin } from 'sweet-album/vue'
app.use(SweetAlbumPlugin)
```

## 照片数据结构

```ts
interface PhotoItem {
  id: string | number
  width: number // 原图像素宽 —— 必填
  height: number // 原图像素高 —— 必填
  takenAt: number | string | Date
  thumbUrl: string
  url?: string // 预览用大图，缺省回落到 thumbUrl
  favorite?: boolean
  alt?: string
  [key: string]: unknown // 你自己的业务字段原样透传
}
```

**`width` 与 `height` 是必填的。** 正列布局必须在排版之前就知道每张图的宽高比。
没有它们，要么得等每张图加载完再排（首屏空白 + 排版反复跳动），要么就得
拉伸图片去凑尺寸 —— 而这个库存在的意义正是避免这两件事。

建议一次性返回全量索引：几万条这样的记录也不过几 MB JSON，换来的是精确的滚动条
和瞬时跳转。图片本身依然是随滚动懒加载的。

缺少可用宽高、日期无法解析、或没有任何 URL 的照片会被跳过，并通过 `onError`
上报，而不是被悄悄错排。

## 文档

- [配置项与 API 参考](./docs/api.zh-CN.md)
- [右键菜单](./docs/context-menu.zh-CN.md)
- [预览器与自定义操作](./docs/viewer.zh-CN.md)
- [主题定制](./docs/theming.zh-CN.md)
- [国际化](./docs/i18n.zh-CN.md)

## 浏览器支持

现代常青浏览器。依赖 `ResizeObserver`、Pointer Events、原生 `loading="lazy"`
图片懒加载和 CSS 自定义属性。

## 许可证

[MIT](./LICENSE)
