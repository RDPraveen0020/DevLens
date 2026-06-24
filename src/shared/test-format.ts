import type { LocatorInfo, SeleniumLang, TestFramework } from './types';

// Pure per-framework formatting of a LocatorInfo into a copy-pasteable locator.
// CSS attribute values use double quotes; XPath text predicates use double
// quotes too, so language-string escaping is uniform.

export interface FormatOpts {
  testIdAttr: string;
  seleniumLang: SeleniumLang;
}

const sq = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
// Escape a value for use inside a double-quoted CSS attribute selector.
const cssVal = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const attrSel = (info: LocatorInfo, attr: string): string => `[${attr}="${cssVal(info.testId ?? '')}"]`;
const mxSel = (info: LocatorInfo): string => `.mx-name-${info.mxName}`;
// Plain #id when it's a valid identifier, else an attribute selector.
const idSel = (info: LocatorInfo): string =>
  info.id && /^[A-Za-z_-][\w-]*$/.test(info.id) ? `#${info.id}` : `[id="${cssVal(info.id ?? '')}"]`;

function playwright(info: LocatorInfo, o: FormatOpts): string {
  switch (info.strategy) {
    case 'testid':
      return o.testIdAttr === 'data-testid'
        ? `page.getByTestId('${sq(info.testId!)}')`
        : `page.locator('${sq(attrSel(info, o.testIdAttr))}')`;
    case 'mxname':
      return `page.locator('${sq(mxSel(info))}')`;
    case 'label':
      return `page.getByLabel('${sq(info.name!)}')`;
    case 'role':
      return `page.getByRole('${info.role}', { name: '${sq(info.name!)}' })`;
    case 'text':
      return `page.getByText('${sq(info.name!)}')`;
    case 'id':
      return `page.locator('${sq(idSel(info))}')`;
    default:
      return `page.locator('${sq(info.css)}')`;
  }
}

function cypress(info: LocatorInfo, o: FormatOpts): string {
  switch (info.strategy) {
    case 'testid':
      return `cy.get('${sq(attrSel(info, o.testIdAttr))}')`;
    case 'mxname':
      return `cy.get('${sq(mxSel(info))}')`;
    case 'role':
    case 'text':
      return info.name ? `cy.contains('${info.tag}', '${sq(info.name)}')` : `cy.get('${sq(info.css)}')`;
    case 'label':
      return info.id ? `cy.get('${sq(idSel(info))}')` : `cy.get('${sq(info.css)}')`;
    case 'id':
      return `cy.get('${sq(idSel(info))}')`;
    default:
      return `cy.get('${sq(info.css)}')`;
  }
}

function testingLibrary(info: LocatorInfo, o: FormatOpts): string {
  void o;
  switch (info.strategy) {
    case 'testid':
      return `screen.getByTestId('${sq(info.testId!)}')`;
    case 'label':
      return `screen.getByLabelText('${sq(info.name!)}')`;
    case 'role':
      return `screen.getByRole('${info.role}', { name: '${sq(info.name!)}' })`;
    case 'text':
      return `screen.getByText('${sq(info.name!)}')`;
    case 'mxname':
      return `container.querySelector('${sq(mxSel(info))}')`;
    case 'id':
      return `container.querySelector('${sq(idSel(info))}')`;
    default:
      return `container.querySelector('${sq(info.css)}')`;
  }
}

function mendix(info: LocatorInfo, o: FormatOpts): string {
  if (info.mxName) return mxSel(info);
  if (info.testId) return attrSel(info, o.testIdAttr);
  if (info.id) return idSel(info);
  return info.css;
}

function seleniumTarget(info: LocatorInfo, o: FormatOpts): { by: 'css' | 'xpath'; value: string } {
  switch (info.strategy) {
    case 'testid':
      return { by: 'css', value: attrSel(info, o.testIdAttr) };
    case 'mxname':
      return { by: 'css', value: mxSel(info) };
    case 'id':
      return { by: 'css', value: idSel(info) };
    case 'role':
    case 'text':
      return info.name
        ? { by: 'xpath', value: `//${info.tag}[normalize-space()="${info.name}"]` }
        : { by: 'css', value: info.css };
    case 'label':
      return info.id ? { by: 'css', value: idSel(info) } : { by: 'css', value: info.css };
    default:
      return { by: 'css', value: info.css };
  }
}

function selenium(info: LocatorInfo, o: FormatOpts): string {
  const { by, value } = seleniumTarget(info, o);
  if (o.seleniumLang === 'python') {
    const m = by === 'css' ? 'By.CSS_SELECTOR' : 'By.XPATH';
    return `driver.find_element(${m}, '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`;
  }
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (o.seleniumLang === 'java') {
    const m = by === 'css' ? 'By.cssSelector' : 'By.xpath';
    return `driver.findElement(${m}("${esc}"))`;
  }
  const m = by === 'css' ? 'By.CssSelector' : 'By.XPath';
  return `driver.FindElement(${m}("${esc}"))`;
}

export function formatLocator(info: LocatorInfo, framework: TestFramework, opts: FormatOpts): string {
  switch (framework) {
    case 'playwright':
      return playwright(info, opts);
    case 'cypress':
      return cypress(info, opts);
    case 'testingLibrary':
      return testingLibrary(info, opts);
    case 'mendix':
      return mendix(info, opts);
    case 'selenium':
      return selenium(info, opts);
  }
}
