#!/usr/bin/env python3
"""
build.py — compiles the We Käre ".dc.html" design-canvas source pages in
site/ into plain, directly-openable static HTML pages in dist/.

What it does, per leaf page (Home, Who-We-Help, How-It-Works, Get-Help,
About-Us, Success-Stories, For-Mentors):
  1. Reads the page's <helmet> (styles/links) and its <x-dc>...</x-dc>
     markup, plus its `<script type="text/x-dc" data-dc-script>` component
     class.
  2. Resolves every `<dc-import name="Nav" .../>` / `<dc-import
     name="Footer" .../>` by inlining Nav.dc.html / Footer.dc.html's own
     markup + component class into the page, in a container that support.js
     mounts independently (so Nav's per-page `active` prop still works).
  3. Merges all three <helmet> blocks into one <head>, de-duplicating
     identical <link>/<style> tags.
  4. Emits a single static .dc.html file wired up to run on support.js —
     the small runtime in site/support.js that implements the `{{ }}`
     template bindings, `sc-if`, `ref`, `style-hover`/`style-focus`, and
     event handlers these pages use.

Run: python3 build.py
"""
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site')
DIST = os.path.join(ROOT, 'dist')

LEAF_PAGES = [
    ('Home.dc.html', 'home'),
    ('Who-We-Help.dc.html', 'who'),
    ('How-It-Works.dc.html', 'how'),
    ('Get-Help.dc.html', 'help'),
    ('About-Us.dc.html', 'about'),
    ('Success-Stories.dc.html', 'stories'),
    ('For-Mentors.dc.html', 'mentors'),
]

SUPPORT_FILES = [
    'support.js', 'image-slot.js', 'wekare-steps.js',
    'wekare-orbits.js', 'wekare-motion.js',
]


def read(name):
    with open(os.path.join(SITE, name), encoding='utf-8') as f:
        return f.read()


def extract(pattern, text, flags=re.S):
    m = re.search(pattern, text, flags)
    return m.group(1) if m else ''


def parse_attrs(attr_str):
    return dict(re.findall(r'([\w-]+)="([^"]*)"', attr_str))


def load_component(filename, class_name):
    """Pull a .dc.html component apart into (helmet, markup, script)."""
    src = read(filename)
    helmet = extract(r'<helmet>(.*?)</helmet>', src)
    body = extract(r'<x-dc>(.*?)</x-dc>', src)
    script = extract(
        r'<script type="text/x-dc" data-dc-script[^>]*>(.*?)</script>', src)
    script = re.sub(r'class\s+Component\s+extends\s+DCLogic',
                     'class %s extends DCLogic' % class_name, script, count=1)
    return helmet, body.strip(), script


def dedupe_helmet_tags(helmet_html):
    """Keep first occurrence of each exact <link .../> or <style>...</style> tag."""
    seen = set()
    out = []
    for tag in re.findall(r'<link[^>]*/?>|<style>.*?</style>|<script>.*?</script>', helmet_html, re.S):
        key = tag.strip()
        if key in seen:
            continue
        seen.add(key)
        out.append(tag)
    return '\n'.join(out)


def inline_imports(body, nav_helmet, nav_body, nav_script,
                    footer_helmet, footer_body, footer_script, active):
    mount_calls = []
    extra_helmet = []
    counter = {'n': 0}

    def repl(m):
        counter['n'] += 1
        attrs = parse_attrs(m.group(1))
        name = attrs.get('name')
        cid = 'dc-import-%d' % counter['n']
        if name == 'Nav':
            extra_helmet.append(nav_helmet)
            mount_calls.append(
                'DC.mount(document.getElementById(%r), NavComponent, {active: %r});'
                % (cid, active))
            return '<div id="%s" data-dc-boundary>%s</div>' % (cid, nav_body)
        elif name == 'Footer':
            extra_helmet.append(footer_helmet)
            mount_calls.append(
                'DC.mount(document.getElementById(%r), FooterComponent, {});' % cid)
            return '<div id="%s" data-dc-boundary>%s</div>' % (cid, footer_body)
        return ''

    body = re.sub(r'<dc-import\s+([^>]*)>\s*</dc-import>', repl, body)
    return body, mount_calls, extra_helmet


def build_page(filename, active, nav_helmet, nav_body, nav_script,
               footer_helmet, footer_body, footer_script):
    page_helmet, page_body, page_script = load_component(filename, 'PageComponent')
    page_body, mount_calls, extra_helmet = inline_imports(
        page_body, nav_helmet, nav_body, nav_script,
        footer_helmet, footer_body, footer_script, active)

    merged_helmet = dedupe_helmet_tags(
        page_helmet + '\n' + '\n'.join(extra_helmet))

    page_title = 'We Käre'

    html = []
    html.append('<!doctype html>')
    html.append('<html lang="en">')
    html.append('<head>')
    html.append('<meta charset="utf-8">')
    html.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    html.append('<title>%s</title>' % page_title)
    html.append(merged_helmet)
    html.append('</head>')
    html.append('<body>')
    html.append('<div id="page-root">')
    html.append(page_body)
    html.append('</div>')
    html.append('<script src="support.js"></script>')
    html.append('<script>')
    html.append(page_script)
    html.append(nav_script)
    html.append(footer_script)
    html.append('DC.mount(document.getElementById("page-root"), PageComponent, {});')
    html.extend(mount_calls)
    html.append('</script>')
    html.append('</body>')
    html.append('</html>')
    return '\n'.join(html)


def main():
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    nav_helmet, nav_body, nav_script = load_component('Nav.dc.html', 'NavComponent')
    footer_helmet, footer_body, footer_script = load_component('Footer.dc.html', 'FooterComponent')

    for filename, active in LEAF_PAGES:
        out = build_page(filename, active, nav_helmet, nav_body, nav_script,
                          footer_helmet, footer_body, footer_script)
        out_path = os.path.join(DIST, filename)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(out)
        print('built', filename)

    for fn in SUPPORT_FILES:
        shutil.copyfile(os.path.join(SITE, fn), os.path.join(DIST, fn))
        print('copied', fn)

    # Landing entry point.
    shutil.copyfile(os.path.join(DIST, 'Home.dc.html'), os.path.join(DIST, 'index.html'))
    print('wrote index.html (-> Home.dc.html)')


if __name__ == '__main__':
    main()
