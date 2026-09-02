import { LLMFunctionTool } from './llm';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  requiresAuth?: boolean;
  timeout?: number;
}

export interface ToolContext {
  userId: string;
  projectId?: string;
  conversationId?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  nextTools?: string[];
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getOpenAITools(): LLMFunctionTool[] {
    return this.list().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}

export async function executeToolChain(
  initialTool: string,
  initialParams: Record<string, unknown>,
  context: ToolContext,
  registry: ToolRegistry,
  maxDepth = 3
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  let currentTool = initialTool;
  let currentParams = initialParams;
  let depth = 0;

  while (currentTool && depth < maxDepth) {
    const tool = registry.get(currentTool);
    if (!tool) break;

    const result = await tool.handler(currentParams, context);
    results.push(result);

    if (result.nextTools && result.nextTools.length > 0 && result.success) {
      currentTool = result.nextTools[0];
      currentParams = {};
    } else {
      break;
    }
    depth++;
  }

  return results;
}
