/* YOUMUSE dynamic catalogue: only published records are rendered. */
(function(){
  const catalogStyle=document.createElement('style');
  catalogStyle.textContent=`.capvora-product-grid .capvora-product-card{background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:0!important}.capvora-product-grid .capvora-product-card>a{background:transparent!important;box-shadow:none!important}.capvora-product-grid .capvora-product-image{background:white!important;border:0!important;box-shadow:none!important}.capvora-product-grid .capvora-product-name{font-size:15px!important;font-weight:400!important;line-height:1.6!important;text-align:left!important;margin:20px 0 22px!important;color:#111!important}.capvora-product-grid .capvora-read-more{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;color:#555!important;font-size:12px!important;font-weight:700!important;letter-spacing:.04em;margin:0!important}.capvora-product-grid .capvora-read-more span{font-size:17px}.capvora-product-grid .capvora-product-meta{display:none!important}`;
  document.head.appendChild(catalogStyle);
  const PAGE_SIZE = 16;
  const DATA_URL = '../data/products.json';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = value => String(value ?? '').toLowerCase();
  function makeCard(product, category){
    const title = esc(product.catalogName || product.name || 'Custom Hat');
    const imagePath = product.image ? (/^(https?:|data:|\/)/i.test(product.image) ? product.image : `../${product.image}`) : '';
    const image = imagePath ? `<img src="${esc(imagePath)}" alt="${title}" loading="lazy">` : '<div class="catalog-no-image">Image coming soon</div>';
    const detail = `../products/${encodeURIComponent(category)}/${encodeURIComponent(product.slug || '')}.html`;
    return `<article class="capvora-product-card" data-product-card>
      <a href="${detail}" aria-label="View ${title}">
        <div class="capvora-product-image">${image}</div>
        <h2 class="capvora-product-name">${title}</h2>
        <span class="capvora-read-more">READ MORE <span>→</span></span>
      </a></article>`;
  }
  function init(grid, allData){
    const category = grid.dataset.category;
    const products = (allData.categories && allData.categories[category] || []).filter(p => p && p.status === 'published' && p.slug && p.name);
    const search = document.querySelector('[data-product-search]');
    const count = document.querySelector('[data-results-count]');
    const pagination = document.querySelector('[data-catalog-pagination]');
    const empty = document.querySelector('[data-catalog-empty]');
    const filters = [...document.querySelectorAll('[data-filter-group]')];
    let currentPage = Math.max(1, Number(new URLSearchParams(location.search).get('page') || 1));
    function render(){
      const q = norm(search && search.value).trim();
      const chosen = {};
      filters.forEach(input => { if(input.checked) (chosen[input.dataset.filterGroup] ||= []).push(input.value); });
      const filtered = products.filter(p => {
        const haystack = norm([p.name,p.description,p.slug,p.techniques,p.materials,p.applications].flat().join(' '));
        const textMatch = !q || haystack.includes(q);
        const filterMatch = Object.entries(chosen).every(([key,values]) => {
          const actual = p[key === 'technique' ? 'techniques' : key === 'material' ? 'materials' : key === 'scene' ? 'applications' : key];
          const arr = Array.isArray(actual) ? actual : String(actual || '').split('|').filter(Boolean);
          return values.some(v => arr.includes(v));
        });
        return textMatch && filterMatch;
      });
      const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      currentPage = Math.min(currentPage,pages);
      const visible = filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
      grid.innerHTML = visible.map(p => makeCard(p,category)).join('');
      if(count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'} shown`;
      if(empty){ empty.hidden = filtered.length !== 0; }
      if(pagination){
        pagination.hidden = pages <= 1;
        pagination.innerHTML = pages > 1 ? `<button type="button" data-page="prev" ${currentPage===1?'disabled':''}>← Previous</button><span>Page ${currentPage} of ${pages}</span><button type="button" data-page="next" ${currentPage===pages?'disabled':''}>Next →</button>` : '';
        pagination.querySelectorAll('button').forEach(btn => btn.addEventListener('click',()=>{
          currentPage += btn.dataset.page === 'next' ? 1 : -1;
          const url = new URL(location.href); if(currentPage>1) url.searchParams.set('page',currentPage); else url.searchParams.delete('page');
          history.replaceState({},'',url); render();
          grid.scrollIntoView({behavior:'smooth',block:'start'});
        }));
      }
    }
    filters.forEach(input => input.addEventListener('change',()=>{currentPage=1;render();}));
    if(search) search.addEventListener('input',()=>{currentPage=1;render();});
    document.querySelector('[data-clear-filters]')?.addEventListener('click',()=>{filters.forEach(i=>i.checked=false);if(search)search.value='';currentPage=1;render();});
    render();
  }
  document.addEventListener('DOMContentLoaded', async function(){
    const grids=[...document.querySelectorAll('[data-capvora-product-grid]')];
    if(!grids.length)return;
    try{
      const response=await fetch(DATA_URL,{cache:'no-store'});
      if(!response.ok) throw new Error('Product data could not be loaded');
      const data=await response.json();
      grids.forEach(grid=>init(grid,data));
    }catch(error){
      grids.forEach(grid=>{
        grid.innerHTML='<p class="catalog-load-error">Product catalogue is temporarily unavailable. Please refresh the page or contact YOUMUSE.</p>';
        const count=document.querySelector('[data-results-count]'); if(count)count.textContent='Catalogue unavailable';
      });
    }
  });
})();
