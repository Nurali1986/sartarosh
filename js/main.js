const IMG = (id, w = 700) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

const SERVICES = [
  { name: "Soch turmagi", text: "Yuvish, turmak, ukladka", time: 45, price: 120000 },
  { name: "Fade", text: "Skin / low / mid / high fade", time: 50, price: 140000 },
  { name: "Soqol dizayni", text: "Shakl berish, konturlash, yog'", time: 30, price: 80000 },
  { name: "Klassik soqol olish", text: "Issiq sochiq, ustara, balzam", time: 40, price: 100000 },
  { name: "Kompleks", text: "Soch turmagi + soqol + yuz niqobi", time: 80, price: 200000 },
  { name: "Bolalar (12 yoshgacha)", text: "Sabr va multfilm bilan", time: 30, price: 80000 },
];
const WORKS = [
  ["1593702275687-f8b402bf1fb5", "Skin fade"],
  ["1622286342621-4bd786c2447c", "Textured crop"],
  ["1599351431202-1e0f0137899a", "Soqol dizayni"],
  ["1605497788044-5a32c7078486", "Ukladka"],
  ["1503951914875-452162b0f3f1", "Klassik soqol"],
  ["1621605815971-fbc98d665033", "Asboblar"],
  ["1512690459411-b9245aed614b", "Studiya"],
];
// 0 = Sunday
const HOURS = [["Yakshanba", null], ["Dushanba", [10, 21]], ["Seshanba", [10, 21]], ["Chorshanba", [10, 21]], ["Payshanba", [10, 21]], ["Juma", [14, 21]], ["Shanba", [9, 20]]];

document.addEventListener("DOMContentLoaded", () => {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const money = (n) => n.toLocaleString("ru-RU").replace(/[  ,]/g, " ") + " so'm";

  const toast = $("#toast");
  let tt;
  const notify = (m) => { toast.textContent = m; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), 2600); };

  // Header / menu
  const header = $("#header"), burger = $("#burger"), nav = $("#nav");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 20);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const toggleMenu = (open) => { nav.classList.toggle("open", open); burger.classList.toggle("open", open); burger.setAttribute("aria-expanded", open); };
  burger.addEventListener("click", () => toggleMenu(!nav.classList.contains("open")));
  const links = $$("a", nav);
  links.forEach((a) => a.addEventListener("click", () => toggleMenu(false)));
  const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((l) => { const s = $(l.getAttribute("href")); if (s) spy.observe(s); });

  // Open / closed status + hours
  const now = new Date();
  const today = HOURS[now.getDay()];
  const isOpen = today[1] && now.getHours() >= today[1][0] && now.getHours() < today[1][1];
  const status = $("#status");
  status.classList.toggle("open", !!isOpen);
  status.innerHTML = `<i></i>${isOpen ? `Ochiq · ${today[1][1]}:00 gacha` : "Hozir yopiq"}`;
  $("#hours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<li class="${d === now.getDay() ? "today" : ""}"><span>${HOURS[d][0]}</span><span>${HOURS[d][1] ? HOURS[d][1][0] + ":00 – " + HOURS[d][1][1] + ":00" : "Dam olish"}</span></li>`).join("");

  // Prices & works
  $("#priceList").innerHTML = SERVICES.map((s, i) => `<div class="price" data-pick="${i}"><h3>${s.name}</h3><b>${money(s.price)}</b><p>${s.text}</p><small>${s.time} daq</small></div>`).join("");
  $("#worksGrid").innerHTML = WORKS.map(([id, t], i) => `<button class="work" data-work="${i}"><img src="${IMG(id)}" alt="${t}" loading="lazy"><span>${t}</span></button>`).join("");

  // Lightbox
  const lb = $("#lightbox");
  $("#worksGrid").addEventListener("click", (e) => {
    const w = e.target.closest("[data-work]");
    if (!w) return;
    $("#lbImg").src = IMG(WORKS[w.dataset.work][0], 1400);
    $("#lbImg").alt = WORKS[w.dataset.work][1];
    lb.classList.add("open"); lb.setAttribute("aria-hidden", "false");
  });
  const closeLb = () => { lb.classList.remove("open"); lb.setAttribute("aria-hidden", "true"); };
  $("#lbClose").addEventListener("click", closeLb);
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });

  // Reveal + counters
  const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("visible");
    revealer.unobserve(e.target);
  }), { threshold: 0.1 });
  $$(".reveal").forEach((el) => revealer.observe(el));
  const counterObs = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target, target = +el.dataset.count, start = performance.now();
    const step = (t) => { const p = Math.min((t - start) / 1600, 1); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("ru-RU"); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    counterObs.unobserve(el);
  }), { threshold: 0.5 });
  $$("[data-count]").forEach((el) => counterObs.observe(el));

  // ---------- Booking wizard ----------
  const booking = { svc: null, day: null, time: null };
  let step = 0;
  const steps = $$(".step"), stepLabels = $$("#steps li"), next = $("#nextBtn"), back = $("#back");

  $("#svcChoice").innerHTML = SERVICES.map((s, i) => `<button type="button" class="opt" data-svc="${i}"><b>${s.name}</b><small>${s.time} daqiqa</small><em>${money(s.price)}</em></button>`).join("");

  const DAY_NAMES = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  $("#days").innerHTML = days.map((d, i) => `<button type="button" class="day" data-day="${i}" ${HOURS[d.getDay()][1] ? "" : "disabled"}><small>${i === 0 ? "Bugun" : DAY_NAMES[d.getDay()]}</small><b>${d.getDate()}</b></button>`).join("");

  const renderSlots = () => {
    const d = days[booking.day];
    const [from, to] = HOURS[d.getDay()][1];
    const dur = SERVICES[booking.svc].time;
    const list = [];
    for (let m = from * 60; m + dur <= to * 60; m += 60) list.push(m);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    $("#slots").innerHTML = list.map((m, i) => {
      const past = booking.day === 0 && m <= nowMin + 30;
      const taken = (d.getDate() * 7 + i * 3) % 5 === 0;
      const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;
      return `<button type="button" class="slot" data-time="${t}" ${past || taken ? "disabled" : ""}>${t}</button>`;
    }).join("");
  };

  const summary = () => {
    const parts = [];
    if (booking.svc !== null) parts.push(`<b>${SERVICES[booking.svc].name}</b> · ${money(SERVICES[booking.svc].price)}`);
    if (booking.day !== null) parts.push(days[booking.day].toLocaleDateString("uz-UZ", { day: "numeric", month: "long" }));
    if (booking.time) parts.push(`soat <b>${booking.time}</b>`);
    $("#summary").innerHTML = parts.join(" · ");
  };
  const canNext = () => (step === 0 ? booking.svc !== null : step === 1 ? booking.day !== null && !!booking.time : false);
  const show = () => {
    steps.forEach((s, i) => (s.hidden = i !== step));
    stepLabels.forEach((l, i) => { l.classList.toggle("active", i === step); l.classList.toggle("done", i < step); });
    back.hidden = step === 0;
    next.hidden = step === 2;
    next.disabled = !canNext();
    summary();
  };

  $("#svcChoice").addEventListener("click", (e) => {
    const o = e.target.closest("[data-svc]");
    if (!o) return;
    booking.svc = +o.dataset.svc;
    booking.time = null;
    $$(".opt").forEach((x) => x.classList.toggle("active", x === o));
    show();
  });
  $("#days").addEventListener("click", (e) => {
    const d = e.target.closest("[data-day]");
    if (!d || d.disabled) return;
    booking.day = +d.dataset.day;
    booking.time = null;
    $$(".day").forEach((x) => x.classList.toggle("active", x === d));
    renderSlots();
    show();
  });
  $("#slots").addEventListener("click", (e) => {
    const s = e.target.closest("[data-time]");
    if (!s || s.disabled) return;
    booking.time = s.dataset.time;
    $$(".slot").forEach((x) => x.classList.toggle("active", x === s));
    show();
  });
  next.addEventListener("click", () => {
    if (!canNext()) return;
    step++;
    if (step === 1 && booking.day === null) {
      const first = $$(".day").find((d) => !d.disabled);
      if (first) first.click();
    }
    show();
  });
  back.addEventListener("click", () => { step = Math.max(0, step - 1); show(); });

  $("#bookForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.querySelector("input").value.trim();
    const s = SERVICES[booking.svc];
    $("#done").innerHTML = `<div class="big">✂</div><h3>Ko'rishguncha, ${name}!</h3><p class="muted">${s.name} · ${days[booking.day].toLocaleDateString("uz-UZ", { weekday: "long", day: "numeric", month: "long" })}, soat ${booking.time}</p><p class="muted">Tasdiq SMS orqali keladi. Kechiksangiz, oldindan xabar bering.</p>`;
    $$(".step, .nav-btns, #steps, #summary").forEach((el) => (el.hidden = true));
    $("#done").hidden = false;
  });

  // Picking a price row jumps into the wizard
  $("#priceList").addEventListener("click", (e) => {
    const p = e.target.closest("[data-pick]");
    if (!p) return;
    step = 0;
    $(`.opt[data-svc="${p.dataset.pick}"]`).click();
    $("#book").scrollIntoView({ behavior: "smooth" });
    notify(`"${SERVICES[p.dataset.pick].name}" tanlandi — kun va vaqtni belgilang`);
  });

  show();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeLb(); toggleMenu(false); } });
  $("#year").textContent = new Date().getFullYear();
});
