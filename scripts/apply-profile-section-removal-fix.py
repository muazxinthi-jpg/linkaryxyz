from pathlib import Path

profiles_path = Path('src/routes/profiles.ts')
editor_path = Path('frontend/src/ProfileExperienceBeta.tsx')

profiles = profiles_path.read_text()
editor = editor_path.read_text()


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return source.replace(old, new, 1)

profiles = replace_once(
    profiles,
    """function safeJson(value: string): unknown {\n  try { return JSON.parse(value); } catch { return {}; }\n}\n""",
    """function safeJson(value: string): unknown {\n  try { return JSON.parse(value); } catch { return {}; }\n}\n\nfunction profileBlockConfig(value: string | null | undefined): Record<string, unknown> {\n  const parsed = safeJson(value || '{}');\n  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)\n    ? parsed as Record<string, unknown>\n    : {};\n}\n\nfunction isArchivedProfileBlock(block: Pick<ProfileBlockRow, 'config_json'>): boolean {\n  return profileBlockConfig(block.config_json).archived === true;\n}\n""",
    'profile block archive helper',
)

profiles = replace_once(
    profiles,
    """  const blocks = await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? AND enabled = 1 ORDER BY position ASC`, [profile.id]);\n  return { profile, blocks };\n""",
    """  const blocks = (await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? AND enabled = 1 ORDER BY position ASC`, [profile.id]))\n    .filter((block) => !isArchivedProfileBlock(block));\n  return { profile, blocks };\n""",
    'public archived block filter',
)

profiles = replace_once(
    profiles,
    """  const blocks = await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? ORDER BY position ASC`, [profileId]);\n  return json({ blocks: blocks.map((block) => ({ id: block.id, type: block.block_type, title: block.title, url: block.url, enabled: Boolean(block.enabled), config: safeJson(block.config_json) })) });\n""",
    """  const blocks = await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? ORDER BY position ASC`, [profileId]);\n  const activeBlocks = blocks.filter((block) => !isArchivedProfileBlock(block));\n  return json({ blocks: activeBlocks.map((block) => ({ id: block.id, type: block.block_type, title: block.title, url: block.url, enabled: Boolean(block.enabled), config: safeJson(block.config_json) })) });\n""",
    'editor archived block filter',
)

profiles = replace_once(
    profiles,
    """  const existing = await db.first<{ id: string; block_type: string }>(`SELECT id, block_type FROM profile_blocks WHERE id = ? AND profile_id = ?`, [blockId, profileId]);\n  if (!existing) throw new HttpError(404, 'Block not found', 'block_not_found');\n""",
    """  const existing = await db.first<{ id: string; block_type: string; config_json: string }>(`SELECT id, block_type, config_json FROM profile_blocks WHERE id = ? AND profile_id = ?`, [blockId, profileId]);\n  if (!existing || isArchivedProfileBlock(existing)) throw new HttpError(404, 'Block not found', 'block_not_found');\n""",
    'archived block update guard',
)

profiles = replace_once(
    profiles,
    """  const current = await db.all<{ id: string }>(`SELECT id FROM profile_blocks WHERE profile_id = ?`, [profileId]);\n  if (current.length !== body.blockIds.length || current.some((row) => !body.blockIds!.includes(row.id))) throw new HttpError(400, 'Block order must include every profile block exactly once', 'invalid_block_order');\n""",
    """  const current = await db.all<{ id: string; config_json: string }>(`SELECT id, config_json FROM profile_blocks WHERE profile_id = ?`, [profileId]);\n  const activeCurrent = current.filter((row) => !isArchivedProfileBlock(row));\n  if (activeCurrent.length !== body.blockIds.length || activeCurrent.some((row) => !body.blockIds!.includes(row.id))) throw new HttpError(400, 'Block order must include every active profile block exactly once', 'invalid_block_order');\n""",
    'active block reorder validation',
)

profiles = replace_once(
    profiles,
    """export async function deleteProfileBlock(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {\n  const auth = await requireAuth(request, env);\n  await verifyCsrf(request, env, auth);\n  const db = new Db(requireDb(env));\n  await requireEditableProfile(db, auth.user.id, profileId);\n  await db.run(`DELETE FROM profile_blocks WHERE id = ? AND profile_id = ?`, [blockId, profileId]);\n  return json({ ok: true });\n}\n""",
    """export async function deleteProfileBlock(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {\n  const auth = await requireAuth(request, env);\n  await verifyCsrf(request, env, auth);\n  const db = new Db(requireDb(env));\n  await requireEditableProfile(db, auth.user.id, profileId);\n  const existing = await db.first<{ config_json: string }>(`SELECT config_json FROM profile_blocks WHERE id = ? AND profile_id = ? LIMIT 1`, [blockId, profileId]);\n  if (!existing || isArchivedProfileBlock(existing)) return json({ ok: true, archived: true });\n\n  // Profile engagement events reference block_id. Archive instead of hard deleting\n  // so a user can remove a section without destroying or invalidating click history.\n  const timestamp = new Date().toISOString();\n  const config = profileBlockConfig(existing.config_json);\n  const archivedConfig = { ...config, archived: true, archivedAt: timestamp };\n  await db.run(`UPDATE profile_blocks SET enabled = 0, config_json = ?, updated_at = ? WHERE id = ? AND profile_id = ?`, [JSON.stringify(archivedConfig), timestamp, blockId, profileId]);\n  return json({ ok: true, archived: true });\n}\n""",
    'history-safe block removal',
)

editor = replace_once(
    editor,
    """  async function removeBlock(block: Block) {\n    if (!profile || !window.confirm(`Remove ${block.title || 'this item'} from the profile?`)) return;\n    const token = cookie('__Host-linkary_csrf'); if (!token) return;\n    const response = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`, { method: 'DELETE', headers: { 'x-csrf-token': token }, credentials: 'same-origin' });\n    if (!response.ok) { setMessage('This profile item could not be removed.'); return; }\n    await load();\n  }\n""",
    """  async function removeBlock(block: Block) {\n    if (!profile || !window.confirm(`Remove ${block.title || 'this item'} from the profile?`)) return;\n    const token = cookie('__Host-linkary_csrf');\n    if (!token) { setMessage('Your session needs to be refreshed before removing profile items.'); return; }\n    setBusy(`remove:${block.id}`);\n    setMessage('');\n    try {\n      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`, { method: 'DELETE', headers: { 'x-csrf-token': token } });\n      setBlocks((current) => current.filter((item) => item.id !== block.id));\n      setAnalytics((current) => ({\n        ...current,\n        sections: Math.max(0, current.sections - (block.enabled ? 1 : 0)),\n        connectedChannels: Math.max(0, current.connectedChannels - (block.enabled && isSocialBlock(block) ? 1 : 0)),\n      }));\n      setPreviewRevision(Date.now());\n      setMessage(`${block.title || blockLabel(block.type)} removed from profile.`);\n    } catch (error) {\n      setMessage(safeError(error, 'This profile item could not be removed.'));\n    } finally {\n      setBusy('');\n    }\n  }\n""",
    'profile editor remove handler',
)

editor = replace_once(
    editor,
    """<button className=\"danger\" onClick={() => void removeBlock(block)}>Remove</button>""",
    """<button className=\"danger\" disabled={busy.startsWith('remove:')} onClick={() => void removeBlock(block)}>{busy === `remove:${block.id}` ? 'Removing...' : 'Remove'}</button>""",
    'profile editor remove button state',
)

profiles_path.write_text(profiles)
editor_path.write_text(editor)
