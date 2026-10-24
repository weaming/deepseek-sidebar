# DeepSeek Sidebar

Chrome Manifest V3 侧边栏扩展：点击工具栏图标或右键菜单打开 DeepSeek 聊天，打开五次后显示评分提示。

源码使用 TypeScript 和 Bun 构建。`make up` 输出到 `~/chrome/deepseek-sidebar`，`make zip` 生成压缩包；在 `chrome://extensions` 加载输出目录。Google 登录建议先在独立标签页完成。

侧边栏依赖 `chat.deepseek.com` 的可用性。评分链接只有在扩展已发布到 Chrome 应用商店后才有效。
