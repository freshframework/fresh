import { page } from "./$about.ts";

export default page(function About() {
  return (
    <div class="panel">
      <h3>About panel</h3>
      <p>Navigating here only replaced this panel — the nav never re-rendered.</p>
    </div>
  );
});
