import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, inlineScriptHashes, withCsp } from '../../scripts/csp'

const sha = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`

const PAGE = `<!doctype html>
<html><head><title>x</title>
<style>#a{color:red}</style></head>
<body>
<script>window.a = 1</script>
<script type="module" src="/assets/index.js"></script>
<script>
  setTimeout(function () {}, 10)
</script>
</body></html>`

describe('inlineScriptHashes', () => {
  it('hashes each inline script exactly, and skips external ones', () => {
    expect(inlineScriptHashes(PAGE)).toEqual([sha('window.a = 1'), sha('\n  setTimeout(function () {}, 10)\n')])
  })

  it('recognises an end tag with whitespace or attributes', () => {
    const html = '<script>a()</script ><script>b()</script foo="x"><script src="/x.js"></script >'
    expect(inlineScriptHashes(html)).toEqual([sha('a()'), sha('b()')])
  })

  it('changes when the script changes, so the policy cannot go stale', () => {
    const edited = PAGE.replace('window.a = 1', 'window.a = 2')
    expect(inlineScriptHashes(edited)[0]).not.toBe(inlineScriptHashes(PAGE)[0])
  })
})

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy(PAGE)
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

  it('allows script only from this origin and the page’s own inline scripts', () => {
    const script = directive('script-src')
    expect(script).toContain("'self'")
    expect(script).toContain(sha('window.a = 1'))
    expect(script).not.toContain('unsafe-inline')
    expect(script).not.toContain('unsafe-eval')
    expect(script).not.toContain('*')
    // No foreign host may supply script at all.
    expect(script.match(/https?:\/\/[^ ]+/g)).toBeNull()
  })

  it('limits network calls to this origin and the analytics host', () => {
    expect(directive('connect-src')).toBe("connect-src 'self' https://us.i.posthog.com")
  })

  it('blocks plugins and base-tag hijacking', () => {
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
  })
})

describe('withCsp', () => {
  it('puts the policy first in <head>', () => {
    const out = withCsp(PAGE)
    expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(out.indexOf('<head>'))
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title>'))
  })
})
