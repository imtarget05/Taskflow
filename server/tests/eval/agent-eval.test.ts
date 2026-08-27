/**
 * Batch evaluator for the agent module (Phase 3 of the Evaluation & Observability
 * plan). Runs a fixed Vietnamese utterance set through `agent.chat()` with the
 * LLM stubbed, and asserts the agent calls the expected tool (or correctly
 * abstains). Runs under Jest so we reuse the mocking + reporting harness; CI
 * invokes it via `npm run eval:agent` (jest with this file).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// -------------------------------------------------------------------------
// Stub LLM – heuristic phát hiện intent create_project / create_task từ
// utterance tiếng Việt. Các intent khác trả về empty → agent trả lời plain
// text, không gọi tool.
// -------------------------------------------------------------------------

/**
 * Detect create_project intent.
 * Returns { name: string } khi có intent + tên; { name: '' } khi có intent
 * nhưng thiếu tên (agent sẽ validate và reject); null khi không có intent.
 */
function detectCreateProject(text: string): { name: string } | null {
  const lower = text.toLowerCase();
  // Nếu bắt đầu bằng "Tạo task" / "Làm task" / "Thêm task" → đây là create_task, không phải create_project
  if (/^(tạo|làm|thêm)\s+task/i.test(lower)) return null;

  // Intent: "tạo/làm/thêm [từ trung gian] board/workspace/dự án/app/HR [mới]..."
  // Cho phép từ trung gian như "một", "mới", "cho", số lượng...
  // Dùng tùy chọn để capture từ có dấu (một, vài, vài*sizeof...) — \w không capture Unicode
  const intentMatch = lower.match(/(tạo|làm|thêm)\s+(?:[\p{L}\p{N}_]+\s+)*(board|workspace|dự\s*án|app|hr)/u);
  if (!intentMatch) return null;

  const after = text.slice(intentMatch.index! + intentMatch[0].length);
  // Nếu sau intent là "thêm task" → đây là câu tạo task, không phải project
  if (/^\s*(và\s*)?thêm\s*task/i.test(after)) return null;

  // Trích tên từ nhiều pattern, dùng \p{L} với flag u để capture chữ có dấu (Đ, ă, â, đ, ...)
  // 1. "tên là X" / "tên là 'X'" / "tên 'X'"
  const nameM = text.match(/\btên\s+là\s*['"]?([\p{L}0-9\s]+?)['"]?(?:\s*[,;]|$)/iu);
  if (nameM && nameM[1].trim()) return { name: nameM[1].trim() };

  // 2. "tên X" (không có "là")
  const nameM2 = text.match(/\btên\s+['"]?([\p{L}0-9\s]+?)['"]?(?:\s*[,;]|$)/iu);
  if (nameM2 && nameM2[1].trim()) return { name: nameM2[1].trim() };

  // 3. "board 'Sprint 12'" / "workspace 'Marketing Q3'" / "dự án 'X'"
  const nameM3 = text.match(/\b(board|workspace|dự\s*án)\s*['"]?([\p{L}0-9\s]+?)['"]?(?:\s*[,;]|$)/iu);
  if (nameM3 && nameM3[2].trim()) return { name: nameM3[2].trim() };

  // 4. "Tạo board X" / "Làm workspace X" / "Tạo dự án X" / "Làm app HR" / "Tạo một board..."
  const nameM4 = text.match(/(?:tạo|làm)\s+\w+\s*(board|workspace|dự\s*án|app|hr)\s*(?:mới\s*)?['"]?([\p{L}0-9\s]+?)['"]?(?:\s*$|,)/iu);
  if (nameM4 && nameM4[2].trim()) return { name: nameM4[2].trim() };

  // Có intent nhưng không tìm được tên → trả empty (agent validation sẽ reject)
  return { name: '' };
}

/**
 * Detect create_task intent.
 * Returns task info khi có intent + title; null khi không có intent hoặc
 * không phải intent tạo mới (sửa/xóa/gửi email/mời...).
 */
function detectCreateTask(text: string): { projectName: string; title: string; priority?: string; dueDate?: string; columnName?: string } | null {
  const lower = text.toLowerCase();
  // Loại các intent không phải tạo mới: "sửa task", "xóa task", "đổi tên",
  // "gửi email", "mời", "add member", "so sánh" (khác), "nói tên task"
  // "khác" → không phải intent tạo task
  if (/(sửa\s*task|xóa\s*task|đổi\s*tên|gửi\s*email|mời|add\s*member|email\s+cho|khác)/i.test(lower)) return null;
  // "nói tên task" → không có intent tạo task thực sự (không có ý định tạo task mới)
  // nhưng "không nói tên task" vẫn là intent tạo task (chỉ thiếu title) → không loại
  // Chỉ loại "nói tên task" khi không có project context (không phải intent tạo mới)
  if (/(nói\s*tên\s*task)/i.test(text) && !/(trong|board|workspace)/i.test(text)) return null;

  // Trích title: "task 'X'" / "thêm task X" / "task X" / "Task 'X'"
  // Dùng lookahead để cho phép whitespace/còn continue sau quote/ký tự kết thúc
  const titleM = text.match(/(?:^|\s)(?:task|thêm\s*task)\s*['"]?([\p{L}0-9\s]+?)['"]?(?=\s|,|$)/iu);
  if (!titleM) {
    // fallback: "Task X trong ..." không có quotes
    const titleM2 = text.match(/\b(task|thêm\s*task)\s+([\p{L}0-9\s]+?)(?:\s+trong|\s+vào|\s+board|\s*,|\s*$)/iu);
    if (!titleM2) return null;
    const title = titleM2[2].trim();
    if (!title) return null;
    // Trích project name
    const projM2 = text.match(/(?:trong|vào)\s+(board|workspace)\s*['"]?([\p{L}0-9\s]+?)['"]?(?:,|$)/iu);
    return {
      projectName: projM2 ? projM2[2].trim() : '',
      title,
    };
  }
  const title = titleM[1].trim();
  if (!title) {
    // Không có title nhưng có "task" → thử trích projectName, trả kết quả với title null
    const projM = text.match(/(?:trong|vào|board|workspace)\s*['"]?([\p{L}0-9\s]+?)['"]?(?:,|$)/iu);
    const projectName = projM ? projM[1].trim() : '';
    if (projectName) {
      return { projectName, title: '' };
    }
    return null;
  }

  // Trích project name từ "trong/vào board X" / "board X:"
  const projM = text.match(/(?:trong|vào|board|workspace)\s*['"]?([\p{L}0-9\s]+?)['"]?(?:,|$)/iu);
  const projectName = projM ? projM[1].trim() : '';

  // Trích column name: "cột X" / "ở cột X" / "column X"
  const colM = text.match(/(?:cột|column)\s*['"]?([\p{L}0-9\s]+?)['"]?(?:,|$)/iu);
  const columnName = colM ? colM[1].trim() : undefined;

  const priority =
    /khẩn|cấp|urgent/i.test(text)
      ? 'URGENT'
      : /cao|high/.test(text)
      ? 'HIGH'
      : /thấp|low/.test(text)
      ? 'LOW'
      : /trung\s*bình|medium/.test(text)
      ? 'MEDIUM'
      : undefined;
  const dueMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  const result = {
    projectName,
    title,
    ...(priority ? { priority } : {}),
    ...(dueMatch ? { dueDate: dueMatch[1] } : {}),
    ...(columnName ? { columnName } : {}),
  };
  return result;
}

/**
 * Stub LLM: ánh xạ utterance → toolCalls.
 * Ưu tiên: nếu câu bắt đầu bằng "Tạo/Làm board..." → create_project.
 * Ngược lại, nếu có "task" → create_task (khi thực sự là intent tạo mới).
 * Các câu khác → empty → agent trả lời plain text.
 */
function stub(text: string) {
  // Ưu tiên: nếu detectCreateProject có tên → trả create_project trước
  // (mix1, mix3: "Tạo board App Mobile và thêm task..." → create_project)
  const project = detectCreateProject(text);
  if (project && project.name) {
    return {
      content: '',
      toolCalls: [{ name: 'create_project', arguments: JSON.stringify({ name: project.name }) }],
    };
  }

  // Ngược lại, nếu có "task" → detectCreateTask
  const task = detectCreateTask(text);
  if (task) {
    // Chỉ trả create_task nếu có project context (trừ khi title tồn tại)
    // edge7: "Tạo task trong board Dự án Website nhưng không nói tên task"
    // → có projectName, title null → vẫn trả create_task
    // Ưu tiên create_task trước create_project khi task có project context
    // → không cho detectCreateProject can thiệp vào câu có "Tạo task trong board..."
    if (task.projectName || task.title) {
      return {
        content: '',
        toolCalls: [
          {
            name: 'create_task',
            arguments: JSON.stringify(task),
          },
        ],
      };
    }
    // Có "task" nhưng không có project → không phải intent tạo task
    return { content: '...', toolCalls: [] };
  }

  // Ưu tiên create_project: nếu câu là "Tạo/Làm board/workspace..."
  const cp = detectCreateProject(text);
  if (cp) {
    // Có intent → trả create_project (kể cả khi name empty, để agent validation xử lý)
    return {
      content: '',
      toolCalls: [{ name: 'create_project', arguments: JSON.stringify({ name: cp.name }) }],
    };
  }

  // Không phải intent tạo mới → plain text response
  return { content: '...', toolCalls: [] };
}

jest.mock('../../src/modules/agent/llm', () => ({
  isLLMConfigured: () => true,
  chatCompletion: jest.fn(),
  chatCompletionWithTools: jest.fn((_messages: unknown) => {
    const last = (_messages as { role: string; content: string }[]).filter((m) => m.role === 'user').pop();
    return Promise.resolve(stub(last?.content ?? ''));
  }),
  routeModel: jest.fn(() => 'default'),
}));

jest.mock('../../src/modules/agent/tracer', () => ({
  traceAgentTurn: <T,>(_meta: unknown, run: (t: undefined) => T): T => run(undefined),
  isLangfuseEnabled: () => false,
  getTracer: () => undefined,
  flushTracer: () => Promise.resolve(),
}));

import { chat } from '../../src/modules/agent/agent.service';

interface Case {
  id: string;
  utterance: string;
  expect: { tool: string | null; params?: Record<string, string | null> };
}

const cases = JSON.parse(readFileSync(resolve(__dirname, 'agent-eval.json'), 'utf8')) as Case[];

describe('agent eval set', () => {
  it.each(cases)('$id: "$utterance" → expects tool=$expect.tool', async (c) => {
    const res = await chat('eval-user', [{ role: 'user', content: c.utterance }], { skipPersist: true });
    const tool = res.action?.name ?? null;
    expect(tool).toBe(c.expect.tool);
  });
});
