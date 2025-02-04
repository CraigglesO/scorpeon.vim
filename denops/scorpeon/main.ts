import {
  assertArray,
  assertBoolean,
  assertNumber,
  assertObject,
  assertString,
  batch,
  Denops,
  g,
  gather,
  undecorate,
} from "./deps.ts";
import { Highlight, Rule } from "./highlight.ts";
import { Tokenizer } from "./token.ts";
import { install } from "./install.ts";
import { fileExists } from "./utils.ts";

export async function main(denops: Denops): Promise<void> {
  const [extensionPath, userRule] = await gather(denops, async (denops) => {
    await g.get(denops, "scorpeon_extensions_path");
    await g.get(denops, "scorpeon_rule");
  }) as [unknown, unknown];

  assertArray<string>(extensionPath);
  assertObject<Rule>(userRule);

  const tokenizer = new Tokenizer(extensionPath);

  denops.dispatcher = {
    async undecorate(
      bufnr: unknown,
      start: unknown,
      end: unknown,
    ): Promise<void> {
      assertNumber(bufnr);
      assertNumber(start);
      assertNumber(end);
      await undecorate(denops, bufnr, start, end);
    },

    async highlight(
      bufnr: unknown,
      path: unknown,
      lines: unknown,
      end: unknown,
      refresh: unknown,
    ): Promise<void> {
      assertNumber(bufnr);
      assertString(path);
      assertArray<string>(lines);
      assertNumber(end);
      assertBoolean(refresh);
      if (!fileExists(path)) {
        return;
      }
      try {
        const scopeName = await tokenizer.getScopeName(path);
        const [tokens, start] = await tokenizer.parse(
          bufnr,
          scopeName,
          lines,
        );
        const spcRule = userRule[scopeName] || userRule['default'] || {};
        const highlight = new Highlight(bufnr, spcRule);
        if (start >= 0) {
          if (refresh) {
            await undecorate(denops, 0, start, end);
          }
          await highlight.set(
            denops,
            tokens.filter((t) => start <= t.line && t.line <= end),
          );
        } else {
          // No change
          if (refresh) {
            // Re-highlight entire buffer
            await undecorate(denops, 0);
          }
          await highlight.set(denops, tokens);
        }
      } catch (e) {
        console.log(`[scorpeon.vim] ${e}`);
        denops.call("scorpeon#disable");
      }
    },

    async showScope(
      bufnr: unknown,
      path: unknown,
      lines: unknown,
    ): Promise<void> {
      assertNumber(bufnr);
      assertString(path);
      assertArray<string>(lines);

      if (!fileExists(path)) {
        return;
      }
      try {
        const scopeName = await tokenizer.getScopeName(path);
        const [tokens] = await tokenizer.parse(bufnr, scopeName, lines);
        await batch(denops, async (denops) => {
          await denops.cmd("vnew");
          await denops.cmd("set buftype=nofile");
          await denops.cmd("setf scorpeon");
          await denops.call("setline", 1, `scopeName: ${scopeName}`);
          await denops.call(
            "setline",
            2,
            tokens.flatMap((token) => {
              const scopes = token.scopes.join(", ");
              const range =
                `\t[${token.line}, ${token.column}] - [${token.line}, ${
                  token.column + token.length
                }]`;
              return [scopes, range];
            }),
          );
        });
      } catch (e) {
        console.log(`[scorpeon.vim] ${e}`);
      }
    },

    async install(input: unknown): Promise<void> {
      assertString(input);
      await install(denops, input, extensionPath[0]);
    },
  };
}
