export function FormSubmitDemo() {
  return (
    <form action="/" method="POST" class="text-left md:px-8">
      <fieldset class="mb-4">
        <legend class="mb-2 font-bold">What's your favorite treat?</legend>

        <label for="lemon-meringue-pie" class="flex gap-2 items-center cursor-pointer">
          <input
            type="radio"
            value="lemon-meringue-pie"
            id="lemon-meringue-pie"
            name="treat"
            checked
          />
          Lemon meringue pie
        </label>
        <label for="lemon-shortbread-cookies" class="flex gap-2 items-center cursor-pointer">
          <input
            type="radio"
            value="lemon-shortbread-cookies"
            id="lemon-shortbread-cookies"
            name="treat"
          />
          Lemon shortbread cookies
        </label>
        <label for="lemon-sherbet" class="flex gap-2 items-center cursor-pointer">
          <input type="radio" value="lemon-sherbet" id="lemon-sherbet" name="treat" />
          Lemon sherbet
        </label>
        <label for="lemon-bars" class="flex gap-2 items-center cursor-pointer">
          <input type="radio" value="lemon-bars" id="lemon-bars" name="treat" />
          Lemon bars
        </label>
      </fieldset>

      <button
        type="submit"
        value="Submit"
        class="pt-2 pb-1 px-3 rounded-sm border-current border-[1.5px] font-semibold cursor-pointer"
      >
        Submit
      </button>
    </form>
  );
}
