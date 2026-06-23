# Claude Code 对话编辑器 — 调研与设计文档

> 最后更新: 2026-05-28
> 作者: grtsinry43
> 状态: 设计阶段

---

## 1. 项目背景

### 1.1 问题

Claude Code 使用过程中，经常会出现"修 bug 拉锯战"：引入一个 bug 后花了几十轮对话才修好，但这些调试过程占据了大量上下文窗口。虽然可以用 `/compact` 或 `/rewind` 压缩，但这些都是**粗粒度**操作——只能整体压缩或从某个检查点截断，无法精确地：

- 删除对话中间某段调试过程
- 保留前后两个大任务的完整上下文
- 只清理无意义的调试来回

### 1.2 目标

构建一个 **TUI 工具**，让用户能精确浏览、选择、编辑 Claude Code 的会话历史。

### 1.3 市场调研结论

**目前市面上没有能精确编辑单条消息的工具。** 现有工具全部是会话级别的操作：

| 工具 | 类型 | 功能 | 编辑单条消息？ |
|------|------|------|:---:|
| [claude-chat-manager](https://github.com/jitbit/claude-chat-manager) | TUI (.NET) | 浏览/删除整个会话 | ❌ |
| [Claude Chats](https://marketplace.visualstudio.com/items?itemName=AlexZanfir.claude-chats) | VS Code 插件 | 重命名/归档/查看对话 | ❌ |
| [session-rescue.py](https://github.com/ianbmacdonald/claude-session-rescue) | Python 脚本 | 修复损坏会话（如图片超限） | ⚠️ 只能删特定内容 |
| [claude-code-log](https://github.com/daaain/claude-code-log) | CLI | JSONL → HTML/Markdown 导出 | ❌ 只读 |
| Claude Code 内置 | CLI 命令 | `/compact` `/clear` `/rewind` | 只能整体操作 |

Anthropic 官方文档（[sessions](https://code.claude.com/docs/en/sessions)、[context-editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)、[hooks](https://code.claude.com/docs/en/hooks)）也只提供会话级命令，**没有消息级编辑 API**。Hook 体系（`PreCompact`、`PostCompact` 等）能在压缩前后注入脚本，但不能修改已有的对话消息内容。

**结论：这是一个空白市场，原理上完全可行。**

---

## 2. Claude Code 会话存储格式（JSONL）

### 2.1 文件位置

```
~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl
```

- `<encoded-project-path>`: 工作目录路径，`/` 替换为 `-`。例如 `/Users/grtsinry43` → `-Users-grtsinry43`
- `<session-uuid>`: 每个会话的 UUID，文件名就是 UUID
- 设定 `CLAUDE_CONFIG_DIR` 环境变量可更改 `~/.claude` 的位置
- 默认 30 天后自动清理，可通过 `cleanupPeriodDays` 配置

### 2.2 文件格式

**JSON Lines**（每行一个独立的 JSON 对象），纯文本，append-only 写入。

一个会话文件的完整生命周期：

```
第 1 行: permission-mode（权限配置）
第 2 行: file-history-snapshot（文件快照基线）
第 3 行: user（第一条用户消息，parentUuid=null）
第 4 行: attachment（附件/系统上下文注入）
第 5~N 行: user / assistant / system 交替的消息链
最后一行: last-prompt（指向链尾的 leafUuid 指针）
```

### 2.3 消息类型（type 字段）

| type | 谁产生的 | 作用 | 有 message 字段？ |
|------|---------|------|:---:|
| `user` | 用户输入 / tool_result | 用户的消息，或者工具执行结果 | ✅ |
| `assistant` | Claude 模型 | Claude 的回复（thinking、text、tool_use） | ✅ |
| `system` | Claude Code 运行时 | 系统消息（hook 执行结果、停止原因等） | ❌ |
| `attachment` | Claude Code 运行时 | 注入的上下文（CLAUDE.md、记忆等） | ❌ |
| `permission-mode` | Claude Code 运行时 | 权限模式标记 | ❌ |
| `file-history-snapshot` | Claude Code 运行时 | 文件修改前的快照（用于 /rewind） | ❌ |
| `last-prompt` | Claude Code 运行时 | 指向链尾的指针 | ❌ |

### 2.4 消息链结构（parentUuid 链表）

消息之间通过 `parentUuid` 形成**单向链表**，这是整个会话的骨架：

```
user(uuid=A, parentUuid=null)          ← 第一条用户消息
  └─ attachment(uuid=B, parentUuid=A)
      └─ user(uuid=C, parentUuid=B)    ← 用户输入
          └─ assistant(uuid=D, parentUuid=C)  ← Claude 回复（含 thinking）
              └─ assistant(uuid=E, parentUuid=D)  ← Claude 回复（含 text + tool_use）
                  └─ user(uuid=F, parentUuid=E)    ← tool_result
                      └─ assistant(uuid=G, parentUuid=F)  ← Claude 继续回复
                          └─ system(uuid=H, parentUuid=G)
                              └─ user(uuid=I, parentUuid=H)  ← 下一轮用户输入
```

链表尾部由文件最后一行 `last-prompt` 的 `leafUuid` 字段指向。

### 2.5 各消息类型的详细字段

#### user 消息

```json
{
  "parentUuid": "22e67084-b4d5-408b-b9a0-85874d60a6c8",
  "type": "user",
  "uuid": "14e7f88f-1c17-4058-9cd5-22e63e837237",
  "timestamp": "2026-05-22T03:20:07.692Z",
  "message": {
    "role": "user",
    "content": "帮我写一个登录页面"
  },
  "isSidechain": false,
  "promptId": "...",
  "permissionMode": "default",
  "userType": "human",
  "entrypoint": "prompt",
  "cwd": "/Users/grtsinry43/project",
  "sessionId": "...",
  "version": "...",
  "gitBranch": "main"
}
```

当 `content` 是嵌套的 `tool_result` 时（工具执行结果），格式变为：

```json
{
  "parentUuid": "...",
  "type": "user",
  "uuid": "...",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_0162MbN2iLH6mBAYyttZe5Mx",
        "content": "文件创建成功",
        "is_error": false
      }
    ]
  }
}
```

#### assistant 消息

```json
{
  "parentUuid": "...",
  "type": "assistant",
  "uuid": "3ec70004-4594-40e5-bb61-e6be2e5a92aa",
  "timestamp": "2026-05-22T03:20:15.123Z",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "thinking",
        "thinking": "用户要写登录页面，我需要先了解项目结构..."
      },
      {
        "type": "text",
        "text": "好的，我来分析项目结构..."
      },
      {
        "type": "tool_use",
        "id": "toolu_01xxx",
        "name": "Read",
        "input": {
          "file_path": "/Users/grtsinry43/project/src/App.tsx"
        },
        "caller": { "type": "direct" }
      }
    ]
  }
}
```

`content` 是一个数组，可能包含多个 block：

| block type | 含义 |
|-----------|------|
| `thinking` | Claude 的思考过程 |
| `text` | Claude 的文本回复 |
| `tool_use` | 工具调用请求 |

#### system 消息

```json
{
  "parentUuid": "...",
  "type": "system",
  "uuid": "...",
  "timestamp": "...",
  "subtype": "hook_result",
  "hookCount": 1,
  "hookInfos": [...],
  "hookErrors": [],
  "preventedContinuation": false,
  "stopReason": "end_turn",
  "hasOutput": true,
  "level": "info"
}
```

#### last-prompt（最后一行）

```json
{
  "type": "last-prompt",
  "lastPrompt": "...",
  "leafUuid": "2c9abd97-5512-41b9-bbe5-63a24c4c3b27",
  "sessionId": "..."
}
```

---

## 3. 工具调用机制（tool_use / tool_result）

### 3.1 核心概念：所有操作都是 tool_use

Claude Code **统一使用 tool_use 处理所有操作**——文件读取、写入、编辑、命令执行全部如此。

| 操作 | 工具名（name） | input 关键字段 | 是否有副作用 |
|------|-------------|---------------|:---:|
| 读文件 | `Read` | `{ file_path, offset?, limit? }` | ❌ 只读 |
| 写文件（创建/覆盖） | `Write` | `{ file_path, content }` | ✅ 有 |
| 局部编辑文件 | `Edit` | `{ file_path, old_string, new_string }` | ✅ 有 |
| 跑命令 | `Bash` | `{ command, description }` | ⚠️ 看命令 |
| 搜索文件 | `Grep` | `{ pattern, path? }` | ❌ 只读 |
| 文件匹配 | `Glob` | `{ pattern, scope? }` | ❌ 只读 |

### 3.2 tool_use 和 tool_result 的配对关系

**这是整个数据模型中最关键的引用关系。**

tool_use 出现在 `assistant` 消息的 `content` 数组中：

```json
// assistant 消息中的一个 content block
{
  "type": "tool_use",
  "id": "toolu_01RDvc7tSq6EGYy3JhPVdgeF",
  "name": "Write",
  "input": {
    "file_path": "/Users/grtsinry43/nlp/exp1_fenci/讲解.md",
    "content": "# 实验一 中文分词..."
  },
  "caller": { "type": "direct" }
}
```

对应的 tool_result 出现在**下一条 `user` 消息**的 `content` 数组中：

```json
// user 消息中的一个 content block
{
  "type": "tool_result",
  "tool_use_id": "toolu_01RDvc7tSq6EGYy3JhPVdgeF",
  "content": "File created successfully at: /path/to/file.md",
  "is_error": false
}
```

引用关系：**`tool_use.id` ↔ `tool_result.tool_use_id`**

#### 多工具并行调用

一条 assistant 消息可能包含**多个 tool_use**（Claude 并行调用工具），紧随其后的 user 消息包含**对应数量的 tool_result**：

```
assistant: content = [tool_use(id=A, Read: file1), tool_use(id=B, Read: file2)]
    ↓
user:      content = [tool_result(tool_use_id=A, "文件1内容..."), tool_result(tool_use_id=B, "文件2内容...")]
```

#### Bash 工具的特殊性

Bash 工具的副作用不确定——`ls` 是只读的，`rm` 是破坏性的，`git push` 是有副作用的。Claude Code 内部会对 Bash 命令做分类（`isReadOnly()` / `isConcurrencySafe()`），但这些分类结果**不存储在 JSONL 中**。编辑器需要自行判断。

### 3.3 tool_result 的错误处理

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xxx",
  "content": "<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>",
  "is_error": true
}
```

`is_error: true` 表示工具执行失败。常见错误：

- Write 前没有 Read：`File has not been read yet`
- Edit 找不到 old_string：`No match found`
- Bash 命令超时或失败
- 权限不足

### 3.4 实际会话中的工具调用统计（真实数据）

以下是从实际会话文件中提取的统计：

**会话 1（23 行，轻量）：**

| 工具 | 调用次数 |
|-----|---------|
| Read | 5 |
| Bash | 3 |
| Write | 1 |

**会话 2（209 行，中等）：**

| 工具 | 调用次数 |
|-----|---------|
| Bash | 21 |
| Write | 11 |
| Read | 7 |
| Edit | 9 |

文件修改操作分布：
```
[86] Write: .../content/info.tex
[90] Edit:  .../content/info.tex
[95] Write: .../content/content.tex
[101] Write: .../content/content.tex
[107] Write: .../content/chapters/chapter1.tex
... (共 20 次文件修改)
```

---

## 4. file-history-snapshot 机制

每个会话的**第 2 行**是 `file-history-snapshot`，记录会话开始时工作区的文件状态基线。这是 Claude Code 的 `/rewind` 功能的基础——它通过对比 snapshot 和后续的 Write/Edit 操作来还原文件。

```json
{
  "type": "file-history-snapshot",
  "messageId": "...",
  "snapshot": { /* 文件内容哈希或完整内容 */ },
  "isSnapshotUpdate": false
}
```

当删除包含 Write/Edit 的对话区间时，这个 snapshot 可能变得不一致。编辑器需要处理这种情况。

---

## 5. 现有上下文管理命令对比

| 命令 | 功能 | 粒度 | 是否有损 |
|------|------|------|:---:|
| `/compact [指令]` | 将对话历史压缩为摘要 | 整体 | ✅ 有损 |
| `/clear` | 清除整个对话历史 | 整体 | 清空 |
| `/rewind` → "Summarize from here" | 从检查点截断，后半段压缩为摘要 | 区间 | ✅ 有损 |
| `/rewind` → "Restore conversation + code" | 回退到检查点 | 区间 | 完全回退 |
| `/rewind` → "Restore conversation only" | 只回退对话，保留文件改动 | 区间 | 对话回退 |
| `/btw` | 快速提问不进入对话历史 | 预防性 | 不适用 |

**`/rewind` 的 "Summarize from here"** 是目前最接近需求的内置功能，但仍是"从某个检查点到当前"的粗粒度截断，不支持选择任意区间。

---

## 6. 设计方案

### 6.1 产品定位

一个离线的、本地的 Claude Code 会话编辑器 TUI。**不连接 Claude API，只操作本地 JSONL 文件。**

### 6.2 技术栈

| 模块 | 选型 | 理由 |
|------|------|------|
| 运行时 | Bun | 启动快，原生 TypeScript，和 Claude Code 一致 |
| TUI 框架 | React + [Ink](https://github.com/vadimdemedes/ink) | 符合 grtsinry43 的要求，组件化开发，Claude Code 自身也用这个组合 |
| 差异展示 | [jsdiff](https://github.com/kpdecker/jsdiff) | 展示编辑前后的差异 |
| CLI 解析 | Commander.js | 参数解析 |

**关于 Ink：** Claude Code 原生使用的是其内部 vendored 版本的 Ink（基于 `react-reconciler` 自建渲染器），但我们直接使用 npm 上的 `ink` 包即可。Ink 目前仍在维护，v4 支持 React 18。

### 6.3 核心数据模型

```typescript
/** JSONL 中的原始消息（保持原样写回） */
interface RawMessage {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  timestamp?: string;
  [key: string]: unknown;  // 保留所有原始字段
}

/** 解析后的消息节点（编辑器内部使用） */
interface MessageNode {
  index: number;              // 在 JSONL 中的行号
  raw: RawMessage;            // 原始 JSON，写回时原样输出
  uuid: string;
  parentUuid: string | null;
  type: string;
  
  // 解析后的展示信息
  role: 'user' | 'assistant' | 'system' | 'other';
  textContent: string;        // 纯文本摘要，用于列表展示
  timestamp?: string;
  
  // 工具调用分析（仅 assistant/user 消息有）
  toolCalls: ToolCallInfo[];
  
  // 编辑器状态
  selected: boolean;
  hasSideEffects: boolean;    // 是否包含有副作用的工具调用
}

/** 工具调用信息 */
interface ToolCallInfo {
  toolUseId: string;
  toolName: string;           // Read / Write / Edit / Bash / ...
  input: Record<string, unknown>;
  
  // 结果信息（从对应的 tool_result 消息中提取）
  resultIndex: number | null; // tool_result 所在的行号，null 表示没有对应结果
  resultOk: boolean | null;   // tool_result.is_error
  resultContent: string;      // tool_result.content 的前 N 个字符
  
  // 副作用分类
  sideEffect: 'none' | 'file-write' | 'file-edit' | 'bash-write' | 'bash-read-only' | 'unknown';
  affectedFile?: string;      // Write/Edit 的 file_path
}
```

### 6.4 TUI 界面设计

```
┌──────────────────────────────────────────────────────────────────┐
│  Claude Code Session Editor                  session: oauth-fix  │
│  File: ~/.claude/projects/.../abc123.jsonl    Lines: 209         │
├──────────────────────────────────────────────────────────────────┤
│  [Space] select  [D] delete selected  [S] summarize selected    │
│  [↑↓] navigate  [Enter] expand  [Q] quit  [W] save & quit      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [✓] L3   user       "实现 OAuth 登录流程"        05-22 11:20   │
│  [✓] L10  assistant   "我来分析项目结构..."        05-22 11:20   │
│  [✓] L12  assistant   🔧 Read: src/auth.ts         05-22 11:20   │
│  [✓] L14  user       tool_result (OK)              05-22 11:20   │
│  ─────────────── 引入 bug 的分界线 ───────────────                │
│  [ ] L86  user       "报错了 TypeError: ..."       05-22 11:35   │
│  [ ] L87  assistant   "让我检查一下..."             05-22 11:35   │
│  [ ] L88  assistant   🔧 Bash: npm test             05-22 11:35   │
│  [ ] L89  user       tool_result (FAIL)            05-22 11:35   │
│  [ ] L90  assistant   🔧 Edit: src/auth.ts ⚠️       05-22 11:36   │
│  [!] L91  user       tool_result (OK) ← 有副作用    05-22 11:36   │
│  ... (40 轮调试) ...                                             │
│  ─────────────── 修完 bug ───────────────                        │
│  [✓] L200 user       "继续下一个功能"              05-22 12:10   │
│  [✓] L201 assistant   "好的，接下来..."            05-22 12:10   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Selected: 6 messages    Side effects: 0    Preview: [Enter]     │
└──────────────────────────────────────────────────────────────────┘
```

展开单条消息的详情视图：

```
┌──────────────────────────────────────────────────────────────────┐
│  Message Detail                                    L90 of 209    │
├──────────────────────────────────────────────────────────────────┤
│  Type: assistant          UUID: 4e7d0dc5-b9c4...                 │
│  Parent: 3ec70004         Timestamp: 2026-05-22T11:36:02Z        │
├──────────────────────────────────────────────────────────────────┤
│  Content Blocks:                                                 │
│                                                                    │
│  1. [thinking] 用户说还是报错，让我看看 auth.ts 的 session 处理... │
│                                                                    │
│  2. [tool_use]                                                     │
│     Name: Edit                                                     │
│     ID: toolu_01xxx                                                │
│     Input:                                                         │
│       file_path: /src/auth.ts                                      │
│       old_string: "const session = getSession()"                   │
│       new_string: "const session = await getSession()"             │
│                                                                    │
│  ⚠️  This tool call MODIFIES a file on disk.                       │
│     Deleting this message will NOT revert the file change.         │
├──────────────────────────────────────────────────────────────────┤
│  Linked tool_result (L91):                                       │
│    Status: ✅ Success                                              │
│    Content: "File edited successfully"                             │
│    is_error: false                                                 │
├──────────────────────────────────────────────────────────────────┤
│  [E] Edit message  [D] Delete message  [Esc] Back                │
└──────────────────────────────────────────────────────────────────┘
```

### 6.5 核心流程

#### 6.5.1 加载流程

```
1. 用户指定 JSONL 文件路径（或通过 --session-id 自动查找）
2. 逐行读取 JSONL，解析为 RawMessage[]
3. 跳过 permission-mode / file-history-snapshot 行（单独记录）
4. 构建 MessageNode[]，填充每个节点的：
   - 基本信息（uuid, parentUuid, type, timestamp）
   - textContent（用于列表展示的纯文本摘要）
   - toolCalls（解析 content 中的 tool_use blocks）
5. 建立 tool_use → tool_result 的映射（通过 tool_use_id）
6. 对每个 toolCall 标记 sideEffect 类型
7. 构建 parentUuid 链表，验证连贯性
8. 渲染 TUI
```

#### 6.5.2 保存流程

```
1. 根据用户的删除/编辑操作，更新 MessageNode[]
2. 修复 parentUuid 链表：
   - 被删除区间 [A, B] 的前驱 P 和后继 N
   - 设置 N.parentUuid = P.uuid
3. 更新 leafUuid：指向最后一条消息的 uuid
4. 保持原始 JSONL 顺序，跳过被删除的消息
5. 重写 permission-mode 和 file-history-snapshot 行（保持原样）
6. 逐行写入新的 JSONL
7. 原文件备份为 .bak
```

#### 6.5.3 删除区间时的安全检查

```
对要删除的区间 [A, B] 扫描所有消息：

1. 收集该区间内的所有 tool_use 调用
2. 按副作用分类：
   - none (Read, Grep, Glob) → 安全
   - file-write (Write) → ⚠️ 警告
   - file-edit (Edit) → ⚠️ 警告
   - bash-write (git push, rm, etc.) → ⚠️ 警告
3. 如果存在有副作用的操作，弹出确认对话框：
   - 列出所有受影响的文件/操作
   - 提供选项：只删对话 / 生成 git revert 脚本 / 取消
4. 确认后，成对删除 tool_use 和对应的 tool_result
```

### 6.6 Bash 命令副作用分类

Claude Code 内部对 Bash 使用 `isReadOnly()` 判断，但结果不存储在 JSONL 中。编辑器可以实现简单的启发式分类：

```typescript
const WRITE_PATTERNS = [
  /\brm\s/, /\bmv\s/, /\bcp\s/, /\bchmod\s/, /\bchown\s/,
  /\bgit\s+(push|commit|reset|rebase|merge|checkout\s+\.)/,
  /\bnpm\s+(install|uninstall|publish)/,
  /\bdocker\s+(rm|stop|kill|exec)/,
  /\bsudo\s/,
  />\s/, />>/, /\|\s*tee\b/,
];

const READ_PATTERNS = [
  /\b(ls|cat|head|tail|grep|find|wc|echo|pwd|which|whoami)\b/,
  /\bgit\s+(status|log|diff|show|branch|remote)\b/,
  /\bnpm\s+(list|outdated|info)\b/,
];

function classifyBashCommand(cmd: string): 'read-only' | 'write' | 'unknown' {
  if (READ_PATTERNS.some(p => p.test(cmd))) return 'read-only';
  if (WRITE_PATTERNS.some(p => p.test(cmd))) return 'write';
  return 'unknown';
}
```

### 6.7 React + Ink 组件结构

```
<App>
  ├── <StatusBar />              // 顶部：会话文件名、行数、快捷键提示
  ├── <MessageList>              // 主列表
  │     ├── <MessageRow />       // 每条消息一行
  │     │     ├── [✓/ /!] 选中标记
  │     │     ├── 行号
  │     │     ├── 类型图标 (user/assistant/system)
  │     │     ├── 文本摘要（截断到单行）
  │     │     ├── 工具调用标记（🔧 Read / ⚠️ Write）
  │     │     └── 时间戳
  │     └── <Divider />          // 分隔线（用户手动插入的标记）
  ├── <MessageDetail />          // 展开详情（按 Enter 切换）
  ├── <ConfirmDialog />          // 删除确认（有副作用时弹出）
  ├── <SideEffectWarning />      // 副作用警告面板
  └── <CommandBar />             // 底部：选中计数、操作提示
</App>
```

状态管理：使用 React `useState` + `useReducer`。数据量不大（一个会话通常几百行），不需要外部状态管理库。

键盘输入：Ink 的 `useInput` hook 处理键盘事件。

### 6.8 文件结构

```
cc-session-editor/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx              // CLI 入口
│   ├── types.ts               // 所有类型定义
│   ├── jsonl/
│   │   ├── parser.ts          // JSONL 解析：逐行读取 → MessageNode[]
│   │   ├── serializer.ts      // MessageNode[] → JSONL 写回
│   │   └── repair.ts          // parentUuid 链条修复 + leafUuid 更新
│   ├── analyzer/
│   │   ├── tool-calls.ts      // tool_use / tool_result 解析与配对
│   │   ├── side-effects.ts    // 副作用分类（Write/Edit/Bash）
│   │   └── bash-classifier.ts // Bash 命令读写分类
│   ├── components/
│   │   ├── App.tsx            // 主应用
│   │   ├── StatusBar.tsx      // 顶部状态栏
│   │   ├── MessageList.tsx    // 消息列表
│   │   ├── MessageRow.tsx     // 单条消息行
│   │   ├── MessageDetail.tsx  // 消息详情展开
│   │   ├── ConfirmDialog.tsx  // 删除确认对话框
│   │   └── CommandBar.tsx     // 底部命令栏
│   ├── hooks/
│   │   ├── useSession.ts      // 会话加载/保存逻辑
│   │   ├── useSelection.ts    // 选择状态管理
│   │   └── useKeyboard.ts     // 键盘快捷键绑定
│   └── utils/
│       ├── path.ts            // ~/.claude/projects/ 路径解析
│       └── text.ts            // 文本截断、摘要生成
└── test/
    ├── fixtures/              // 测试用的 JSONL 样本
    ├── parser.test.ts
    └── repair.test.ts
```

---

## 7. 踩坑注意事项

### 7.1 parentUuid 链条断裂

Claude Code 官方自身就有这个 bug（[issue #22526](https://github.com/anthropics/claude-code/issues/22526)）：JSONL 中的 `parentUuid` 会引用不存在的 UUID。所以**不要假设链条一定是连贯的**，解析时要做容错处理。

### 7.2 assistant 消息的 content 类型不一致

- 纯文本回复：`content` 是 `string`
- 含工具调用/思考：`content` 是 `ContentBlock[]`（数组）

解析时必须 `typeof content === 'string'` 判断。

### 7.3 tool_result 不一定紧跟在 tool_use 后面

并行工具调用时，多个 tool_use 可能出现在一条 assistant 消息中，对应的多个 tool_result 出现在同一条 user 消息中。配对逻辑必须通过 `tool_use_id` 匹配，不能假设位置相邻。

### 7.4 file-history-snapshot 必须保留

这个行是 `/rewind` 功能的基线，删除会导致该会话无法使用 rewind。编辑器在重写 JSONL 时**必须原样保留**第 1~2 行（permission-mode 和 file-history-snapshot）。

### 7.5 last-prompt 必须更新

保存时必须确保最后一行的 `leafUuid` 指向新的链尾消息，否则 Claude Code 加载时可能出错。

### 7.6 isSidechain 字段

有些消息的 `isSidechain: true`，这表示它是子代理（subagent）的对话，不是主对话的一部分。处理时需要注意区分。

### 7.7 编辑后需要重启 Claude Code

Claude Code 不会实时监听 JSONL 文件变化（除了活跃会话的写入）。编辑完 JSONL 后，用 `claude --resume` 重新加载即可。

### 7.8 备份

在写入前**必须**备份原文件。建议格式：

```
<session-uuid>.jsonl          ← 原文件
<session-uuid>.jsonl.bak      ← 备份
<session-uuid>.jsonl.bak.1    ← 第二次编辑的备份
```

---

## 8. 开放问题

1. **是否支持"插入消息"？** 理论上可以在链条中间插入用户消息来修改对话走向，但实用性存疑，建议 MVP 不做。
2. **是否支持批量多个会话的编辑？** MVP 只做单个会话。
3. **是否需要 git 集成？** 比如自动生成 `git diff` 来展示有副作用的文件变更。建议后续版本加入。
4. **压缩为摘要的功能（[S] 快捷键）是否需要调用 LLM？** 如果需要，就引入了 API 依赖。建议 MVP 只做删除，不做 LLM 摘要。
