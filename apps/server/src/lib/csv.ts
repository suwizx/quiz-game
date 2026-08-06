/** ต้องใส่ quote เมื่อมีตัวคั่น, quote, หรือขึ้นบรรทัดใหม่อยู่ในค่า (RFC 4180) */
function escapeCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * แปลงเป็น CSV ที่ Excel เปิดแล้วภาษาไทยไม่เพี้ยน
 * - นำหน้าด้วย BOM ไม่งั้น Excel บน Windows เดาเป็น cp874/ANSI แล้วได้ตัวยึกยือ
 * - ปิดบรรทัดด้วย CRLF ตามสเปก
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * ชื่อไฟล์ที่มีภาษาไทยต้องส่งทั้ง ASCII fallback และ filename* ตาม RFC 5987
 * (เบราว์เซอร์ทุกตัวหยิบ filename* ส่วน ascii ไว้ให้ client เก่าที่อ่านไม่เป็น)
 */
export function attachmentHeaders(filename: string, asciiFallback: string) {
  const ascii = asciiFallback.replace(/[^\w.\-]/g, "_");
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "no-store",
  };
}
