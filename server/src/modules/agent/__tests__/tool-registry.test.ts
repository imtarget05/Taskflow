import { ToolRegistry, ToolDefinition, ToolContext, executeToolChain } from '../tool-registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and retrieves a tool', () => {
    const tool: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      handler: jest.fn().mockResolvedValue({ success: true }),
    };
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
  });

  it('returns undefined for unregistered tool', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered tools', () => {
    const tool1: ToolDefinition = {
      name: 'tool1',
      description: 'First tool',
      parameters: {},
      handler: jest.fn(),
    };
    const tool2: ToolDefinition = {
      name: 'tool2',
      description: 'Second tool',
      parameters: {},
      handler: jest.fn(),
    };
    registry.register(tool1);
    registry.register(tool2);
    const tools = registry.list();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(['tool1', 'tool2']);
  });

  it('overwrites tool with same name on re-registration', () => {
    const tool1: ToolDefinition = {
      name: 'dup',
      description: 'v1',
      parameters: {},
      handler: jest.fn(),
    };
    const tool2: ToolDefinition = {
      name: 'dup',
      description: 'v2',
      parameters: {},
      handler: jest.fn(),
    };
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.get('dup')?.description).toBe('v2');
    expect(registry.list()).toHaveLength(1);
  });

  it('converts tools to OpenAI function format', () => {
    const tool: ToolDefinition = {
      name: 'create_project',
      description: 'Create a project',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: jest.fn(),
    };
    registry.register(tool);
    const openaiTools = registry.getOpenAITools();
    expect(openaiTools).toHaveLength(1);
    expect(openaiTools[0]).toEqual({
      type: 'function',
      function: {
        name: 'create_project',
        description: 'Create a project',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      },
    });
  });

  it('returns empty array when no tools registered', () => {
    expect(registry.getOpenAITools()).toEqual([]);
  });
});

describe('executeToolChain', () => {
  let registry: ToolRegistry;
  const context: ToolContext = { userId: 'u1' };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('executes a single tool and returns result', async () => {
    const handler = jest.fn().mockResolvedValue({ success: true, data: 'done' });
    registry.register({
      name: 'step1',
      description: 'First step',
      parameters: {},
      handler,
    });

    const results = await executeToolChain('step1', { param: 'value' }, context, registry);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(handler).toHaveBeenCalledWith({ param: 'value' }, context);
  });

  it('chains tools via nextTools', async () => {
    const handler1 = jest.fn().mockResolvedValue({ success: true, nextTools: ['step2'] });
    const handler2 = jest.fn().mockResolvedValue({ success: true, data: 'final' });
    registry.register({ name: 'step1', description: '', parameters: {}, handler: handler1 });
    registry.register({ name: 'step2', description: '', parameters: {}, handler: handler2 });

    const results = await executeToolChain('step1', {}, context, registry);
    expect(results).toHaveLength(2);
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('stops chain when tool fails', async () => {
    const handler1 = jest.fn().mockResolvedValue({ success: false, error: 'failed', nextTools: ['step2'] });
    const handler2 = jest.fn().mockResolvedValue({ success: true });
    registry.register({ name: 'step1', description: '', parameters: {}, handler: handler1 });
    registry.register({ name: 'step2', description: '', parameters: {}, handler: handler2 });

    const results = await executeToolChain('step1', {}, context, registry);
    expect(results).toHaveLength(1);
    expect(handler2).not.toHaveBeenCalled();
  });

  it('respects max depth limit', async () => {
    const handler = jest.fn().mockResolvedValue({ success: true, nextTools: ['self'] });
    registry.register({ name: 'self', description: '', parameters: {}, handler });

    const results = await executeToolChain('self', {}, context, registry, 3);
    expect(results).toHaveLength(3);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('stops when next tool is not registered', async () => {
    const handler = jest.fn().mockResolvedValue({ success: true, nextTools: ['missing'] });
    registry.register({ name: 'step1', description: '', parameters: {}, handler });

    const results = await executeToolChain('step1', {}, context, registry);
    expect(results).toHaveLength(1);
  });

  it('passes empty params to chained tools', async () => {
    const handler1 = jest.fn().mockResolvedValue({ success: true, nextTools: ['step2'] });
    const handler2 = jest.fn().mockResolvedValue({ success: true });
    registry.register({ name: 'step1', description: '', parameters: {}, handler: handler1 });
    registry.register({ name: 'step2', description: '', parameters: {}, handler: handler2 });

    await executeToolChain('step1', { initial: 'data' }, context, registry);
    expect(handler1).toHaveBeenCalledWith({ initial: 'data' }, context);
    expect(handler2).toHaveBeenCalledWith({}, context);
  });
});
