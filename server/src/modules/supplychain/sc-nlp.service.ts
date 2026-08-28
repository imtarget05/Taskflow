import { prisma } from '../../lib/prisma';
import { emitToProject } from '../../lib/socket';
import { chatCompletion, isLLMConfigured } from '../agent/llm';
import { z } from 'zod';

export const analyseOrderSchema = z.object({
  text: z.string().min(1).max(4000),
  projectId: z.string().max(60).nullable().optional(),
  orderId: z.string().max(60).nullable().optional(),
});

export type AnalyseOrderInput = z.infer<typeof analyseOrderSchema>;
export type AnalyseOrderResult = {
  classification: string;
  confidence: number;
  suggestedAction: string;
  workflowTrigger: string;
  llmUsed: boolean;
};

const RULES = [
  {
    type: 'PO_NEW',
    patterns: /\b(po\s*số|po\s*number|purchase\s*order|đặt\s*hàng|yêu\s*cầu\s*mua|new\s*po|po\s*new)\b/i,
    action: 'phê duyệt PO',
    trigger: 'approve_po',
  },
  {
    type: 'PO_UPDATE',
    patterns: /\b(cập\s*nất\s*po|update\s*po|điều\s*chỉnh\s*po|po\s*cập\s*nất|tăng\s*giảm\s*quantity|quantity\s*change|po\s*update)\b/i,
    action: 'xác nhận điều chỉnh PO',
    trigger: 'update_po',
  },
  {
    type: 'INVOICE',
    patterns: /\b(hóa\s*đơn|invoice|inv\s*-?\s*\d|thanh\s*toán|giá\s*tổng|vat)\b/i,
    action: 'gửi cho bộ phận kế toán',
    trigger: 'invoice_verify',
  },
  {
    type: 'ASN',
    patterns: /\b(asn|advanced\s*shipping\s*notice|shipment|eta\s*\d|gửi\s*hàng|đang\s*shipping|shipping\s*notice)\b/i,
    action: 'kiểm tra hàng nhập',
    trigger: 'asn_check',
  },
];

function ruleBasedFallback(text: string): AnalyseOrderResult {
  for (const rule of RULES) {
    if (rule.patterns.test(text)) {
      return {
        classification: rule.type,
        confidence: 0.8,
        suggestedAction: rule.action,
        workflowTrigger: rule.trigger,
        llmUsed: false,
      };
    }
  }
  return {
    classification: 'UNKNOWN',
    confidence: 0.5,
    suggestedAction: 'xác định loại tài liệu',
    workflowTrigger: 'manual_review',
    llmUsed: false,
  };
}

async function classifyWithLLM(text: string): Promise<AnalyseOrderResult> {
  const systemPrompt =
    'Bạn là AI phân loại tài liệu supply chain. Phân tích văn bản tiếng Việt và phân loại thành 1 trong 5 loại: PO_NEW (PO mới), PO_UPDATE (PO cập nhật), INVOICE (hóa đơn), ASN (Advanced Shipping Notice), UNKNOWN (không xác định).\n\n' +
    'Trả về JSON: {"classification": "PO_NEW|PO_UPDATE|INVOICE|ASN|UNKNOWN", "confidence": 0.0-1.0, "suggestedAction": "...", "workflowTrigger": "..."}\n\n' +
    'Chỉ trả về JSON, không thêm giải thích.';

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { temperature: 0.3, maxTokens: 512 }
    );

    const jsonMatch = response.match(/\{(?:[^{}]*|\{[^{}]*\})*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        classification: parsed.classification || 'UNKNOWN',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        suggestedAction: parsed.suggestedAction || 'xử lý theo phân loại',
        workflowTrigger: parsed.workflowTrigger || 'manual_review',
        llmUsed: true,
      };
    }
  } catch {
    // LLM failed → fallback rule-based
  }

  return ruleBasedFallback(text);
}

export async function analyseOrder(
  userId: string,
  input: AnalyseOrderInput
): Promise<AnalyseOrderResult> {
  const result = isLLMConfigured()
    ? await classifyWithLLM(input.text).catch(() => ruleBasedFallback(input.text))
    : ruleBasedFallback(input.text);

  const record = await prisma.sCOrderAnalysis.create({
    data: {
      userId,
      projectId: input.projectId ?? undefined,
      orderId: input.orderId ?? undefined,
      sourceText: input.text,
      classification: result.classification as any,
      confidence: result.confidence,
      suggestedAction: result.suggestedAction,
      workflowTrigger: result.workflowTrigger,
      llmUsed: result.llmUsed,
    },
  });

  // Emit socket event (best-effort, không throw)
  try {
    emitToProject(input.projectId ?? '', 'sc:order:analysed', {
      analysisId: record.id,
      classification: result.classification,
      confidence: result.confidence,
      suggestedAction: result.suggestedAction,
      workflowTrigger: result.workflowTrigger,
    });
  } catch {
    // Socket may not be connected — ignore
  }

  return result;
}
