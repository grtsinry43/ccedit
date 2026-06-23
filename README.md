# Claude Code Session Editor (ccedit)

一个 TUI 工具，用于精确浏览、选择和编辑 Claude Code 的会话历史。

## 功能特性

✓ **两步操作** - 先选择会话，再编辑消息
✓ **自动发现** - 自动读取当前目录的 Claude 会话
✓ **精确消息编辑** - 删除特定的调试来回，保留重要内容
✓ **可视化会话浏览** - 消息列表、工具调用标记、时间戳
✓ **副作用检测** - 自动标记包含文件修改的消息
✓ **安全删除** - 删除前显示受影响的文件，支持备份
✓ **链式修复** - 自动修复断裂的 parentUuid 链条

## 快速开始

### 1. 构建项目

```bash
git clone <repository-url>
cd ccedit
pnpm install
pnpm -w run package
```

### 2. 使用命令

```bash
# 进入你的项目目录
cd /path/to/your/project

# 运行 ccedit - 自动显示当前目录的会话列表
node /path/to/ccedit/dist/ccedit.js

# 或者直接编辑指定会话
node /path/to/ccedit/dist/ccedit.js <session-id>

# 指定其他项目路径
node /path/to/ccedit/dist/ccedit.js -p /other/project/path

# 修复损坏的会话
node /path/to/ccedit/dist/ccedit.js --repair
```

### 3. 工作流程

**第一步：选择会话**
- 运行 `ccedit` 后，显示当前目录的所有会话
- 使用 `↑↓` 导航，`Enter` 选择会话

**第二步：编辑消息**
- 选择会话后，显示消息列表
- 使用 `Space` 选择要删除的消息
- 使用 `D` 删除选中的消息
- 使用 `W` 保存并退出

## 操作指南

### 会话选择界面

| 快捷键 | 功能 |
|--------|------|
| `↑/↓` | 导航会话列表 |
| `Enter` | 选择会话并进入编辑 |
| `Q` | 退出程序 |

### 消息编辑界面

| 快捷键 | 功能 |
|--------|------|
| `↑/↓` | 导航消息 |
| `Space` | 选择/取消选择消息 |
| `Enter` | 查看消息详情 |
| `E` | 编辑消息内容 |
| `D` | 删除选中的消息 |
| `W` | 保存并退出 |
| `B` | 返回会话列表 |
| `Q` | 不保存退出 |
| `Esc` | 关闭详情/取消编辑 |

## 项目结构

```
ccedit/
├── packages/
│   ├── core/              # 核心逻辑（解析、序列化、修复）
│   ├── tui/               # TUI 组件和 CLI 入口
│   └── shared/            # 工具函数
├── dist/
│   └── ccedit.js          # 打包后的可执行文件
├── scripts/
│   └── package.cjs        # 打包脚本
└── examples/
    └── usage.sh           # 使用示例
```

## 开发

```bash
# 开发模式（watch）
pnpm run dev

# 运行测试
pnpm run test:integration

# 构建
pnpm -w run build

# 打包
pnpm -w run package
```

## 示例

```bash
# 1. 编辑当前项目的会话
cd ~/my-project
node ~/ccedit/dist/ccedit.js

# 2. 直接编辑指定会话
node ~/ccedit/dist/ccedit.js 65aab4c0-b9a0-45d1-9916-fe8f315bb7a7

# 3. 修复损坏的会话
node ~/ccedit/dist/ccedit.js --repair

# 4. 查看帮助
node ~/ccedit/dist/ccedit.js --help
```

## 打包和分发

```bash
# 打包成单个可执行文件
pnpm -w run package

# 输出位置
dist/ccedit.js

# 可以复制到任何地方使用
cp dist/ccedit.js /usr/local/bin/ccedit
chmod +x /usr/local/bin/ccedit

# 然后直接使用
ccedit
```

## 技术栈

- **运行时**: Node.js >= 22
- **TUI 框架**: React 19 + Ink 7
- **语言**: TypeScript 6
- **包管理**: pnpm 11 workspaces
- **构建**: Turborepo
- **打包**: Node.js script

## 测试

```bash
# 运行所有测试
pnpm run test:integration

# 测试覆盖
✓ JSONL 解析
✓ tool_use ↔ tool_result 映射
✓ 副作用检测
✓ 链条验证和修复
✓ 序列化和元数据保留
✓ TUI 组件渲染
(13 个测试全部通过)
```

## 注意事项

1. **备份** - 默认会在保存前创建 `.bak` 备份文件
2. **重启 Claude Code** - 编辑后需要 `claude --resume` 重新加载
3. **副作用** - 删除包含文件修改的消息不会自动还原磁盘文件
4. **链式结构** - 使用 `--repair` 选项修复断裂的 parentUuid 链

## License

MIT
