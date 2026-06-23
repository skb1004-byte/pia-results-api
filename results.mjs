// ============================================================
//  AI PIA · 결과 저장/조회 Netlify Function (v2, ESM)
//  배포 위치: (Netlify 사이트 레포)/netlify/functions/results.mjs
//  필요 패키지: @netlify/blobs  (npm i @netlify/blobs)
//  환경변수:   ADMIN_PASSWORD = 관리자 비밀번호
//
//  ★ 이 파일의 핵심 추가점:
//     학부모가 관리자 비번 없이 "학생ID + 발급코드(pairCode)"로
//     본인 자녀 결과만 조회할 수 있는 분기(아래 [학부모 조회]).
//
//  기존에 동작하던 results 함수가 있다면, 저장소(getStore 이름)와
//  레코드 구조가 동일해야 기존 데이터도 함께 보입니다.
//  기존 함수를 그대로 두고 싶으면 [학부모 조회] 블록만 기존 파일에
//  복사해 넣어도 됩니다(저장은 rec.pairCode 가 포함돼 있어야 함).
// ============================================================
import { getStore } from '@netlify/blobs';

const H = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const j = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: H });

  const store = getStore('pia-results');
  const url = new URL(req.url);
  const q = url.searchParams;
  const ADMIN = process.env.ADMIN_PASSWORD || '';

  // ---- 저장 (PIA 검사 화면에서 POST) ----
  if (req.method === 'POST') {
    let rec;
    try { rec = JSON.parse(await req.text()); } catch (e) { return j({ ok: false, error: 'bad json' }, 400); }
    if (!rec || !rec.id) return j({ ok: false, error: 'no id' }, 400);
    rec.savedAt = new Date().toISOString();
    await store.setJSON(rec.id, rec);
    return j({ ok: true, id: rec.id });
  }

  if (req.method !== 'GET') return j({ ok: false, error: 'method' }, 405);

  // ---- 서버 상태 확인 ----
  if (q.get('ping')) return j({ ok: true, hasPassword: !!ADMIN });

  // ---- [학부모 조회] 발급코드만으로 조회 (학생ID 선택, 관리자 비번 불필요) ----
  const pid = q.get('id'), pcode = q.get('code');
  if (pcode && !q.get('admin')) {
    const want = String(pcode).toUpperCase();
    // 1) id가 주어지면 우선 그 키로 시도
    if (pid) {
      const rec = await store.get(pid, { type: 'json' });
      if (rec && String(rec.pairCode || '').toUpperCase() === want) return j({ ok: true, result: rec });
    }
    // 2) 코드만으로 전체 스캔(발급코드는 고유)
    const { blobs } = await store.list();
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec && String(rec.pairCode || '').toUpperCase() === want) return j({ ok: true, result: rec });
    }
    return j({ ok: false, error: 'not found or code mismatch' }, 404);
  }

  // ---- 관리자 인증 (목록/단건/삭제) ----
  const admin = q.get('admin');
  if (admin == null) return j({ ok: false, error: 'auth required' }, 401);
  if (!ADMIN) return j({ ok: false, error: 'no server password' }, 503);
  if (admin !== ADMIN) return j({ ok: false, error: 'wrong password' }, 401);

  const del = q.get('del');
  if (del) { await store.delete(del); return j({ ok: true }); }

  const id = q.get('id');
  if (id) {
    const rec = await store.get(id, { type: 'json' });
    if (!rec) return j({ ok: false, error: 'not found' }, 404);
    return j({ ok: true, result: rec });
  }

  // 목록(요약만)
  const { blobs } = await store.list();
  const results = [];
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (!rec) continue;
    results.push({
      id: rec.id, name: rec.name, grade: rec.grade, klass: rec.klass,
      school: rec.school, type: rec.type, reliability: rec.reliability,
      doneCount: rec.doneCount, savedAt: rec.savedAt
    });
  }
  return j({ ok: true, results });
};

export const config = { path: '/api/results' };
