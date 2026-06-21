import { handler, page } from "./$[slug].ts";

export const handlers = handler((ctx) => {
  return { data: `blog ${ctx.params.slug}` };
});

export default page(function Page(props) {
  return (
    <div>
      <h1 class="red">Blog post: {props.data}</h1>
    </div>
  );
});
