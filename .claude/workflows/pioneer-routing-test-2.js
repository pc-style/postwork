export const meta = {
  name: 'pioneer-routing-test-2',
  description: 'Try alternate pioneer model id spellings',
  phases: [{ title: 'Test' }],
}
phase('Test')
const variants = ['pioneer', 'pioneer-auto', 'pioneer/auto-medium', 'gpt-5.5-pioneer']
const results = {}
for (const v of variants) {
  try {
    const r = await agent('Reply with the single word: ok', { model: v, label: `test-${v}` })
    results[v] = r
  } catch (e) {
    results[v + '_error'] = String((e && e.message) || e)
  }
}
return results