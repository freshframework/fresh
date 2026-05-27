// @ts-ignore upstream issue https://github.com/denoland/deno/issues/30560
import styles from "./CssModulesNonIsland.module.css";

export function CssModulesNonIsland() {
  return (
    <div class="green">
      <h1 class={styles.root}>green text</h1>
    </div>
  );
}
