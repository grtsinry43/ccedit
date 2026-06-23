#!/bin/bash

# ccedit 快速开始示例

echo "=== Claude Code Session Editor 使用示例 ==="
echo ""

# 示例 1: 查看帮助
echo "1. 查看帮助:"
echo "   $ node dist/ccedit.js --help"
echo ""

# 示例 2: 编辑当前目录的会话
echo "2. 编辑当前目录的会话:"
echo "   $ cd /your/project"
echo "   $ node dist/ccedit.js"
echo "   # 会显示当前目录的所有会话列表"
echo ""

# 示例 3: 编辑指定会话
echo "3. 直接编辑指定会话:"
echo "   $ node dist/ccedit.js 65aab4c0-b9a0-45d1-9916-fe8f315bb7a7"
echo ""

# 示例 4: 指定项目路径
echo "4. 指定项目路径:"
echo "   $ node dist/ccedit.js -p /Users/grtsinry43/my-project"
echo ""

# 示例 5: 修复损坏的会话
echo "5. 修复损坏的会话（链条断裂）:"
echo "   $ node dist/ccedit.js --repair"
echo "   $ node dist/ccedit.js 65aab4c0... --repair"
echo ""

echo "=== TUI 操作快捷键 ==="
echo ""
echo "会话选择界面:"
echo "  ↑/↓    - 导航"
echo "  Enter  - 选择会话"
echo "  Q      - 退出"
echo ""
echo "消息编辑界面:"
echo "  ↑/↓    - 导航消息"
echo "  Space  - 选择/取消选择"
echo "  Enter  - 查看详情"
echo "  D      - 删除选中消息"
echo "  W      - 保存并退出"
echo "  B      - 返回会话列表"
echo "  Q      - 不保存退出"
echo ""

echo "=== 打包命令 ==="
echo ""
echo "# 构建并打包"
echo "$ pnpm -w run package"
echo ""
echo "# 打包后使用"
echo "$ ./dist/ccedit.js"
echo ""
echo "# 或链接到全局"
echo "$ npm link"
echo "$ ccedit"
