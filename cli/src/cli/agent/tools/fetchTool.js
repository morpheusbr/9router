/**
 * fetchTool — Web Surfing via <fetch url="..." />.
 *
 * Permite que a IA leia conteúdo de URLs sem usar bash.
 * Converte HTML para markdown legível.
 * Fase: 'post'
 */

const { COLORS } = require("../../utils/input");

/**
 * Converte HTML simples para markdown.
 * Sem dependências externas — cobre tags comuns (headings, links, lists, code, bold/italic).
 */
function htmlToMarkdown(html) {
  let md = html;
  // Remove script, style, nav, footer, header tags with content
  md = md.replace(/<(script|style|nav|footer|header|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');
  // Bold / Italic
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  // Inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  // Images
  md = md.replace(/<img[^>]+alt="([^"]*)"[^>]+src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  // Lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?(ul|ol|dl)[^>]*>/gi, '\n');
  // Paragraphs / line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<p[^>]*>/gi, '');
  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, content) => {
    return content.split('\n').map(l => `> ${l}`).join('\n') + '\n';
  });
  // Tables (simple)
  md = md.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, '| $1 ');
  md = md.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, '| $1 ');
  md = md.replace(/<\/tr>/gi, '|\n');
  md = md.replace(/<\/?(table|thead|tbody|tr)[^>]*>/gi, '');
  // Horizontal rule
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');
  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Normalize whitespace
  md = md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ');
  return md.trim();
}

module.exports = {
  name: "fetch",
  description: "Web Surfing: lê conteúdo de URLs via <fetch url=\"...\" />",
  phase: "post",

  extract(aiFullMessage) {
    const match = aiFullMessage.match(/<fetch\s+url="([^"]+)"\s*\/>/);
    if (!match) return [];
    return [{ url: match[1] }];
  },

  async execute(action, context) {
    const { messages } = context;
    const { url } = action;

    console.log(`\n${COLORS.dim}🌐 [IA Web Surfing: Lendo conteúdo de '${url}'...]${COLORS.reset}`);

    let webContent = "";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const contentType = res.headers.get('content-type') || '';
      const html = await res.text();

      if (contentType.includes('text/html')) {
        webContent = htmlToMarkdown(html).substring(0, 20000);
      } else {
        // Plain text / JSON / etc
        webContent = html.substring(0, 20000);
      }
    } catch (e) {
      webContent = e.name === 'TimeoutError'
        ? `Timeout: URL não respondeu em 15s.`
        : `Falha ao acessar URL: ${e.message}`;
    }

    messages.push({
      role: "system",
      content: `Conteúdo lido da URL '${url}':\n\`\`\`\n${webContent}\n\`\`\`\nContinue seu raciocínio baseando-se nestes dados.`
    });

    return { aiThinking: true, shouldBreak: true };
  }
};
