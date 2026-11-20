import { api } from "@/lib/api";
import {
  blockedPath,
  type BlockedTime,
  type CreateBlockedResponse,
  type NewBlock,
} from "@/lib/blocked";
import type { Paginated } from "@/lib/booking";



// GET: blokir mendatang satu dokter, 20 per halaman.
export function fetchBlocks(practitionerId: number, page = 1): Promise<Paginated<BlockedTime>> {
  return api<Paginated<BlockedTime>>(blockedPath(practitionerId, page));
}

// POST: waktu sudah berbentuk ISO UTC (hasil buildBlockRange), bukan jam klinik.
export function createBlock(practitionerId: number, block: NewBlock): Promise<CreateBlockedResponse> {
  return api<CreateBlockedResponse>(`/practitioners/${practitionerId}/blocked-times`, {
    method: "POST",
    body: JSON.stringify(block),
  });
}

// DELETE: balasan 204 tanpa isi, jadi Promise<void>. Blokir benar-benar dihapus.
export function deleteBlock(id: number): Promise<void> {
  return api<void>(`/blocked-times/${id}`, { method: "DELETE" });
}