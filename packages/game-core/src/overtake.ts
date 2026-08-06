/** อันดับของผู้เล่นแต่ละคน ณ ช่วงเวลาหนึ่ง — 1 คือที่หนึ่ง */
export type RankMap = ReadonlyMap<string, number>;

export interface Overtake {
  /** passed = เราแซงเขา · passed_by = เขาแซงเรา */
  kind: "passed" | "passed_by";
  counterpartId: string;
}

/**
 * หาว่าใคร "ข้าม" ใครระหว่างสอง snapshot ของกระดานคะแนน
 *
 * นิยาม: X ข้าม Y เมื่อ X เคยอยู่อันดับต่ำกว่า Y แล้วตอนนี้อยู่สูงกว่า
 * ต้องเทียบทุกคู่แบบนี้ ไม่ใช่ดูแค่ "ใครมานั่งอันดับที่เราเคยอยู่" เพราะเวลามีคนกระโดด
 * ข้ามหลายอันดับทีเดียว คนที่เลื่อนลงตามกันจะถูกจับคู่ผิด
 * (เดิม A=1 B=2 C=3 แล้ว C พุ่งขึ้นที่ 1 → B จะได้ข้อความว่า "A แซงคุณ" ทั้งที่ A ก็ตกเหมือนกัน)
 *
 * คืนอย่างมากคนละหนึ่งเหตุการณ์ต่อรอบ เลือกคู่ที่ "เด่นที่สุด" มาเล่า
 */
export function computeOvertakes(before: RankMap, after: RankMap): Map<string, Overtake> {
  const result = new Map<string, Overtake>();

  // เทียบได้เฉพาะคนที่มีอันดับครบทั้งสอง snapshot (คนเพิ่ง join ไม่มีอันดับเก่า)
  const players = [...after.keys()].filter((id) => before.has(id));

  for (const me of players) {
    const myBefore = before.get(me) as number;
    const myAfter = after.get(me) as number;
    if (myBefore === myAfter) continue;

    /** คนที่เราแซง — เก็บคนที่เคยอยู่สูงสุด (อันดับเก่าน้อยสุด) ไว้เล่า */
    let passed: { id: string; rank: number } | null = null;
    /** คนที่แซงเรา — เก็บคนที่ตอนนี้อยู่สูงสุด (อันดับใหม่น้อยสุด) ไว้เล่า */
    let passedBy: { id: string; rank: number } | null = null;

    for (const other of players) {
      if (other === me) continue;
      const otherBefore = before.get(other) as number;
      const otherAfter = after.get(other) as number;

      if (myBefore > otherBefore && myAfter < otherAfter) {
        if (!passed || otherBefore < passed.rank) passed = { id: other, rank: otherBefore };
      } else if (otherBefore > myBefore && otherAfter < myAfter) {
        if (!passedBy || otherAfter < passedBy.rank) passedBy = { id: other, rank: otherAfter };
      }
    }

    // ขยับขึ้นเอง → เล่าเรื่องที่เราแซงคนอื่น · ตกลง → เล่าเรื่องที่ถูกแซง
    // (ขยับได้ทั้งสองทางพร้อมกัน เช่นแซงคนหนึ่งแต่โดนอีกคนแซง จึงต้องเลือก)
    const chosen = myAfter < myBefore ? (passed ?? passedBy) : (passedBy ?? passed);
    if (!chosen) continue;

    result.set(me, {
      kind: chosen === passed ? "passed" : "passed_by",
      counterpartId: chosen.id,
    });
  }

  return result;
}
