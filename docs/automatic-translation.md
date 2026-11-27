# YOUMUSE automatic page translation

English remains the only authored website content. No language folders or translated HTML pages are generated. The shared language selector translates the current DOM through `/api/translate` when a visitor selects a language. Form values, uploads, contact links and the language menu are excluded.

## Enable the free Azure plan

1. Sign in to the Azure portal in the website owner's account.
2. Create a **Translator** resource with **F0 / Free** as its pricing tier. Confirm that F0 is available in the selected subscription and region. Do not select S1 or upgrade billing automatically.
3. Obtain its key and region under **Keys and Endpoint**. Never put the key in HTML, JavaScript, GitHub or chat messages.
4. In Cloudflare, select **Workers & Pages → youmusehats → Settings → Variables and Secrets**, then configure the production environment:
   - `AZURE_TRANSLATOR_KEY`: encrypted secret containing the resource key.
   - `AZURE_TRANSLATOR_REGION`: the region identifier shown for that resource (omit for a global resource if Azure specifies that a region header is unnecessary).
5. Deploy the prepared website version. Secrets and variables must be bound before the deployment that uses them.
6. `/api/translate` GET must return `enabled: true`. Test a category, product detail, article and enquiry form in at least two languages, then switch back to English.

## Updates and limits

- Editing an English page changes the content sent to the service. Text-based cache keys ensure changed text does not reuse an old translation.
- Public text is checked against the current deployed page and catalogue before it can be sent to Azure. The API will not translate arbitrary client-supplied text.
- Identical translated strings are reused from Cloudflare's cache. Cache entries are opportunistic, so a miss can use Azure quota again.
- Azure F0 currently provides 2 million characters per month across translation languages. F0 stops translating at its limit; the integration does not upgrade the plan.
- The Cloudflare Pages Functions free quota also applies. This integration creates no paid resources or new storage bindings.
- On an API error, quota exhaustion, missing credentials or a timeout, the page returns to its original English content and shows a short availability message.
- Browser language preference is remembered locally. A visitor can always return to English without an API call.

## Checks

Run `node --test tests/runtime-translation.test.mjs`. These tests use a stub translator and never send requests or incur usage. Real Azure translation still requires a configured F0 resource and a live smoke test.

Official references:

- https://azure.microsoft.com/en-us/pricing/details/translator/
- https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate
- https://developers.cloudflare.com/pages/functions/bindings/
