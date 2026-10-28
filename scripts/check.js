#!/usr/bin/env node
/**
 * Lightweight release check: syntax-check every JavaScript file, parse every
 * JSON file, and verify that the bundle's declared entry points exist.
 */

import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = []

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) files.push(path)
  }
}

await walk(root)

let failed = false
for (const file of files.filter((path) => path.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    console.log(`ok  ${file.slice(root.length + 1)}`)
  } catch (error) {
    failed = true
    console.error(`ERR ${file.slice(root.length + 1)}`)
    console.error(error.stderr?.toString() ?? error.message)
  }
}

for (const file of files.filter((path) => path.endsWith('.json'))) {
  try {
    JSON.parse(await readFile(file, 'utf8'))
    console.log(`ok  ${file.slice(root.length + 1)}`)
  } catch (error) {
    failed = true
    console.error(`ERR ${file.slice(root.length + 1)}: ${error.message}`)
  }
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const required = [
  manifest.main,
  manifest.dsh?.bundle?.patch,
  manifest.dsh?.client === undefined ? undefined : manifest.exports['./client'],
  './icon.svg',
  './locale/en.json',
  './locale/zh.json',
]
for (const relativePath of required.filter(Boolean)) {
  const path = resolve(root, relativePath)
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new Error('not a regular file')
    console.log(`ok  ${relativePath}`)
  } catch (error) {
    failed = true
    console.error(`ERR missing ${relativePath}: ${error.message}`)
  }
}

// The client bundle registers a factory under the package name; a mismatch
// leaves the row unresolvable and silently drops the /btw renderer.
const client = await readFile(join(root, manifest.exports['./client']), 'utf8')
const declaredId = /__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/.exec(client)?.[1]
if (declaredId !== manifest.name) {
  failed = true
  console.error(`ERR client factory id "${declaredId ?? '<missing>'}" does not match package name "${manifest.name}"`)
} else {
  console.log('ok  client factory id')
}

// Every locale key must exist in both shipped dictionaries.
const keySet = (locale) => {
  const body = new RegExp(`const ${locale} = \\{([\\s\\S]*?)\\}`).exec(client)?.[1] ?? ''
  return new Set([...body.matchAll(/'([a-zA-Z0-9]+\.[A-Za-z0-9]+)':/g)].map((match) => match[1]))
}
const en = keySet('EN')
const zh = keySet('ZH')
for (const [locale, keys] of [['en', en], ['zh', zh]]) {
  if (keys.size === 0) {
    failed = true
    console.error(`ERR client ${locale} dictionary has no keys`)
  }
}
for (const key of en) {
  if (!zh.has(key)) {
    failed = true
    console.error(`ERR client key "${key}" is missing from the zh dictionary`)
  }
}
for (const key of zh) {
  if (!en.has(key)) {
    failed = true
    console.error(`ERR client key "${key}" is missing from the en dictionary`)
  }
}

if (failed) {
  console.error('\ncheck failed')
  process.exit(1)
}
console.log('\ncheck passed')
