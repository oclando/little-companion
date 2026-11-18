# 小伙伴桌宠 · Little Companion

基于 Electron 的 Windows 桌面学习与角色陪伴工具。把桌宠、提醒、角色聊天和剧情背词放在同一个本地应用中，通过用户自己的 API 接入生成式剧情。

这是个人项目的公开整理版，基于 2.5.0。设计与实现使用了 AI 辅助；当前仍为持续开发的原型。

## 功能

- **桌宠与提醒**：桌面悬浮、拖动缩放、角色切换、多人舞台、待办、课程通知及番茄钟。
- **角色聊天**：导入 JSON / PNG 酒馆格式角色卡，独立聊天窗口、流式回复、多人依次回应、手动管理角色记忆。
- **剧情背词**：选择自己的词库，生成分支路线；记忆卡、拼写或辨义、错词重练与学习履历。可按角色设定调用 API 生成旁白及对白。
- **学习资料**：资料导入、OCR、阅读与翻译辅助、复习题及练习记录。
- **本机朗读**：使用系统提供的中英文语音，不需要额外语音 API。

兼容酒馆角色卡不表示内置或分发 SillyTavern 程序。

## 开始使用

开发环境建议使用 Windows 和 Node.js 22 LTS，需要联网安装 npm 依赖与 Electron。

```bash
git clone https://github.com/oclando/little-companion.git
cd little-companion
npm ci
npm start
```

安装依赖后会自动把 npm 包中的中英文 OCR 数据复制到 `assets/ocr/`；若曾禁用安装脚本，可手动运行 `node scripts/prepare-ocr.js`。Electron 本身也需要完成安装脚本。

启动后在“聊天与冒险”中配置自己的 API 地址、模型和密钥，再导入角色卡、创建聊天或剧情存档。请使用模型服务商实际支持的模型名称；默认值不保证适用于每个账号。

仓库附带通用桌宠形象和 [许照宁示例角色卡](examples/characters/xu-zhaoning.json)。许照宁是 AI 生成并经用户与 AI 协作修订的角色，可用于体验导入与叙事流程；示例不包含测试对话或私人记忆。

## 测试与打包

```bash
npm test
npm run package
```

打包命令生成 Windows NSIS 安装程序，输出到 `dist/`。测试覆盖词汇解析、复习调度、资料处理、翻译、角色与记忆隔离、模型协议、冒险判定及系统语音路由；不代表对所有电脑或模型服务的完整验收。

## 目录

```text
src/                    Electron 窗口、学习功能和 AI 模块
assets/                 通用图标、默认形象与素材模板
examples/characters/    可公开的示例角色卡
tests/                  可独立运行的核心测试
scripts/                OCR 资源准备脚本
docs/                   架构与数据边界说明
```

详见 [架构与数据边界](docs/architecture.md)。

## 数据与 API

本项目不提供 API 密钥。密钥通过 Electron `safeStorage` 加密保存在本机，运行存档保存在 Electron 的 userData 目录，均不属于源码。

配置远程模型后，生成所需的角色设定、当前对话和相关记忆会发送到用户选择的 API 服务，可能产生费用。请自行选择可信服务，注意上下文长度与调用次数。

公开版不附带开发者的个人角色卡、角色素材、聊天记录、学习资料、本机配置或 Git 开发历史。使用者新增的资料仍需自行保管；`.gitignore` 不能替代分享前检查。

## 素材与依赖

通用图标和默认形象使用 AI 生成素材；许照宁为 AI 协作示例。第三方依赖保留各自许可。Spine 运行时附有原始 [许可文件](src/vendor/SPINE-RUNTIMES-LICENSE.txt)，提供 Spine 功能不代表授予 Spine 编辑器或其他素材的使用权。

本仓库暂未为自有代码选择统一的开源许可证；公开可查看不等于授权任意再分发。使用第三方代码与资源时请检查对应许可。
