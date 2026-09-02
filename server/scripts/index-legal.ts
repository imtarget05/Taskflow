/**
 * Legal corpus indexer — đưa văn bản pháp luật vào kho RAG.
 *
 * Flow: đọc văn bản (file path arg hoặc mẫu sẵn) → chunkText (dùng
 * env LEGAL_CHUNK_SIZE) → embed (LLM_EMBED_MODEL) → upsert LegalDocument +
 * ghi LegalChunk kèm vector pgvector(1024).
 *
 * Dùng cho demo localhost:  `npm run legal:index` (mẫu sẵn) hoặc
 * `npm run legal:index -- /path/to/law.txt`.
 *
 * Yêu cầu: LLM_BASE_URL + LLM_EMBED_MODEL, DB có pgvector, đã migrate.
 */
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { embedBatched } from '../src/modules/agent/llm';
import { chunkText } from '../src/modules/legal/legal.service';

const vectorLiteral = (embedding: number[]): string =>
  `'[${embedding.join(',')}]'::vector`;

/** Mẫu mini bằng tiếng Việt — để localhost có data demo mà không cần tải file. */
const SAMPLE_TEXT = `Luật Bảo vệ quyền lợi người tiêu dùng (mẫu).
Điều 1. Phạm vi điều chỉnh. Luật này quy định quyền và nghĩa vụ của người tiêu dùng, của tổ chức, cá nhân kinh doanh hàng hóa, dịch vụ.

Điều 5. Quyền của người tiêu dùng. Người tiêu dùng có quyền: được bảo đảm an toàn tính mạng, sức khỏe, tài sản; được cung cấp thông tin chính xác, đầy đủ về hàng hóa, dịch vụ mà mình mua.

Điều 8. Trách nhiệm của tổ chức, cá nhân kinh doanh. Tổ chức, cá nhân kinh doanh phải cung cấp thông tin trung thực, không lừa dối; đổi trả hàng theo thỏa thuận khi hàng lỗi.

Điều 12. Khiếu nại, tố cáo. Người tiêu dùng có quyền khiếu nại, tố cáo hành vi vi phạm pháp luật bảo vệ người tiêu dùng với cơ quan nhà nước có thẩm quyền.

Điều 17. Bồi thường thiệt hại. Tổ chức, cá nhân kinh doanh gây thiệt hại cho người tiêu dùng do hàng hóa không bảo đảm chất lượng phải bồi thường theo quy định của pháp luật.`;

function extractArticleRef(chunk: string, fallback: number): string {
  const m = chunk.match(/(?:Khoản\s+\d+\s+Điều\s+\d+|Điều\s+\d+)/i);
  return m ? m[0] : `Chunk ${fallback}`;
}

async function indexFile(filePath?: string): Promise<void> {
  const text = filePath ? readFileSync(resolve(filePath), 'utf8') : SAMPLE_TEXT;
  const title = filePath ? resolve(filePath).split('/').pop()! : 'Luật Bảo vệ quyền lợi người tiêu dùng (mẫu)';
  const sourceUrl = filePath
    ? `file://${resolve(filePath)}`
    : 'sample://luat-bao-ve-nguoi-tieu-dung';

  const chunks = chunkText(text);
  console.log(`[legal:index] ${chunks.length} chunks (từ ${text.length} ký tự)`);

  const embeddings = await embedBatched(chunks, { batchSize: 32, concurrency: 4 });
  if (embeddings.length !== chunks.length) {
    throw new Error(`Embed đếm không khớp: ${embeddings.length} != ${chunks.length}`);
  }

  await prisma.legalDocument.upsert({
    where: { sourceUrl },
    create: { sourceUrl, title, documentNumber: 'SAMPLE', rawText: text },
    update: { title, rawText: text },
  });

  const doc = await prisma.legalDocument.findUniqueOrThrow({ where: { sourceUrl } });

  // Xoá chunk cũ rồi ghi lại (re-index là idempotent).
  const { count } = await prisma.legalChunk.deleteMany({ where: { documentId: doc.id } });
  console.log(`[legal:index] xóa ${count} chunk cũ của document ${doc.id}`);

  for (let i = 0; i < chunks.length; i += 1) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "legal_chunks" ("id", "documentId", "articleRef", "content", "embedding", "metadata", "createdAt")
      VALUES (${randomUUID()}, ${doc.id}, ${extractArticleRef(chunks[i], i + 1)}, ${chunks[i]},
              ${Prisma.raw(vectorLiteral(embeddings[i]))},
              ${JSON.stringify({ chunkIndex: i, sourceUrl })},
              NOW())
    `);
  }

  console.log(`[legal:index] OK: ${chunks.length} chunks đã index cho "${title}"`);
}

// CLI entrypoint: script chạy đứng một mình (tsx scripts/index-legal.ts [file])
indexFile(process.argv[2])
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[legal:index] FAIL', err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });