import * as fs from 'fs';
import * as path from 'path';

export function renderTemplate(
  templateName: string,
  variables: Record<string, any>,
): string {
  const templatePath = path.join(
    process.cwd(),
    'src/modules/mail/template',
    templateName,
  );

  let html = fs.readFileSync(templatePath, 'utf8');

  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(
      `{{${key}}}`,
      value !== undefined && value !== null ? String(value) : '',
    );
  }

  return html;
}
