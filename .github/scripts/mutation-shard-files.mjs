// Calcule, pour un lot (SHARD, 1-indexé) du job de mutation testing en CI,
// la sous-liste de stryker.config.mjs's `mutate` à passer à
// `stryker run --mutate`. Importer la liste depuis stryker.config.mjs
// (plutôt que la dupliquer dans le workflow) évite qu'un module ajouté à ce
// tableau échappe silencieusement aux deux lots.
import { appendFileSync } from 'node:fs'

const shardCount = 2
const shard = Number(process.env.SHARD)

const { default: config } = await import('../../stryker.config.mjs')
const files = config.mutate.filter((_, i) => i % shardCount === shard - 1)

appendFileSync(process.env.GITHUB_OUTPUT, `files=${files.join(',')}\n`)
