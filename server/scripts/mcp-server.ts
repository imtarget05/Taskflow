/* eslint-disable no-console */
/**
 * TaskFlow MCP server — stdio transport.
 *
 * Chạy: npm run mcp  (từ workspace server)
 *
 * Auth: MCP_TOKEN env (Bearer-style shared secret). Client MCP phải set
 * MCP_USER_ID để gắn context user — phù hợp chạy local/agent cá nhân.
 * Nếu MCP_TOKEN không set → server từ chối khởi động (fail-closed).
 *
 * Cấu hình ví dụ (Claude Desktop / bất kỳ MCP client nào):
 * {
 *   "mcpServers": {
 *     "taskflow": {
 *       "command": "npx",
 *       "args": ["tsx", "scripts/mcp-server.ts"],
 *       "cwd": "server/",
 *       "env": { "MCP_TOKEN": "...", "MCP_USER_ID": "<userId>" }
 *     }
 *   }
 * }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { prisma } from '../src/lib/prisma';
import { mcpToolDefinitions, callTool, McpContext } from '../src/modules/mcp/mcp.tools';

const token = process.env.MCP_TOKEN;
const userId = process.env.MCP_USER_ID;

if (!token || !userId) {
  console.error('[mcp] MCP_TOKEN và MCP_USER_ID là bắt buộc.');
  process.exit(1);
}

async function resolveUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId! }, select: { id: true } });
  if (!user) {
    console.error('[mcp] MCP_USER_ID không tồn tại trong DB.');
    process.exit(1);
  }
  return user.id;
}

async function main(): Promise<void> {
  const ctx: McpContext = { userId: await resolveUserId() };
  const server = new McpServer({ name: 'taskflow', version: '1.0.0' });

  for (const def of mcpToolDefinitions) {
    server.registerTool(def.name, {
      description: def.description,
      inputSchema: def.inputSchema as never,
    }, async (args: Record<string, unknown>) => {
      try {
        const result = await callTool(def.name, args ?? {}, ctx);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Lỗi: ${message}` }], isError: true };
      }
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] TaskFlow MCP server đang chạy trên stdio.');
}

main().catch((err) => {
  console.error('[mcp] Khởi động thất bại:', err);
  process.exit(1);
});
