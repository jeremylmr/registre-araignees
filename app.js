const SUPABASE_URL = "https://zyygcgrhhvuikitggrhw.supabase.co";
const SUPABASE_KEY = window.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_KEY || SUPABASE_KEY.includes("COLLER_ICI")) {
  document.addEventListener("DOMContentLoaded", () => {
    const g = document.getElementById("gallery");
    if (g) g.innerHTML = '<div class="empty">Configuration incomplète : ajoute la clé publique Supabase dans config.js.</div>';
  });
  throw new Error("Supabase publishable key manquante");
}

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let rows = [];
let session = null;
let editingId = null;
let currentPhotoPath = null;
let currentPhotoUrl = null;

const $ = (s) => document.querySelector(s);
const gallery = $("#gallery");

function setAdminUI() {
  const admin = !!session;
  $("#addBtn").classList.toggle("hidden", !admin);
  $("#loginBtn").classList.toggle("hidden", admin);
  $("#logoutBtn").classList.toggle("hidden", !admin);
  $("#adminState").textContent = admin ? "Mode administrateur" : "Consultation publique";
  render();
}

async function load() {
  gallery.innerHTML = '<div class="empty">Chargement du registre…</div>';
  const { data, error } = await client
    .from("araignees")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    gallery.innerHTML = '<div class="empty">Impossible de charger le registre.</div>';
    console.error(error);
    return;
  }

  rows = data || [];
  render();
}

function render() {
  const q = $("#search").value.trim().toLowerCase();
  const filtered = rows.filter((x) =>
    (x.nom || "").toLowerCase().includes(q) ||
    (x.emplacement || "").toLowerCase().includes(q) ||
    (x.observation || "").toLowerCase().includes(q)
  );

  gallery.innerHTML = "";

  if (!filtered.length) {
    gallery.innerHTML =
      '<div class="empty">' +
      (rows.length
        ? "Aucune araignée ne correspond à cette recherche."
        : "Aucune araignée recensée pour le moment.") +
      "</div>";
    return;
  }

  for (const item of filtered) {
    const card = document.createElement("article");
    card.className = "card";

    const photo = document.createElement("div");
    photo.className = "photo";

    if (item.photo_path) {
      const { data } = client.storage.from("araignees").getPublicUrl(item.photo_path);
      const imageUrl = data.publicUrl;

      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = item.nom;
      img.onclick = () => {
        $("#zoomImg").src = imageUrl;
        $("#zoomImg").alt = item.nom;
        $("#zoomDialog").showModal();
      };
      photo.appendChild(img);
    } else {
      photo.innerHTML = '<span class="placeholder">🕷️</span>';
    }

    const content = document.createElement("div");
    content.className = "content";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.nom;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Emplacement";

    const place = document.createElement("div");
    place.className = "place";
    place.textContent = item.emplacement;

    content.append(name, label, place);

    const zone = document.createElement("div");
    zone.className = "zone-badge";
    zone.textContent = item.exterieur ? "Extérieur" : "Intérieur";
    content.appendChild(zone);

    const observationBtn = document.createElement("button");
    observationBtn.className = "light observation-btn";
    observationBtn.textContent = "Voir les observations";
    observationBtn.onclick = () => openObservation(item);
    content.appendChild(observationBtn);

    if (session) {
      const actions = document.createElement("div");
      actions.className = "actions";

      const edit = document.createElement("button");
      edit.className = "light";
      edit.textContent = "Modifier";
      edit.onclick = () => openEdit(item);

      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Supprimer";
      del.onclick = () => removeItem(item);

      actions.append(edit, del);
      content.appendChild(actions);
    }

    card.append(photo, content);
    gallery.appendChild(card);
  }
}

function resetEdit() {
  editingId = null;
  currentPhotoPath = null;
  currentPhotoUrl = null;
  $("#editForm").reset();
  $("#preview").textContent = "Photo de la suspecte";
  $("#editMessage").textContent = "";
}

function openEdit(item = null) {
  resetEdit();

  if (item) {
    editingId = item.id;
    currentPhotoPath = item.photo_path || null;
    $("#nom").value = item.nom;
    $("#emplacement").value = item.emplacement;
    $("#exterieur").checked = !!item.exterieur;
    $("#observation").value = item.observation || "";
    $("#editTitle").textContent = "Modifier l’araignée";

    if (currentPhotoPath) {
      const { data } = client.storage.from("araignees").getPublicUrl(currentPhotoPath);
      currentPhotoUrl = data.publicUrl;
      $("#preview").innerHTML = '<img src="' + currentPhotoUrl + '" alt="">';
    }
  } else {
    $("#editTitle").textContent = "Ajouter une araignée";
  }

  $("#editDialog").showModal();
}

function openObservation(item) {
  $("#observationTitle").textContent = item.nom;
  $("#observationPlace").textContent = "📍 " + item.emplacement;
  $("#observationZone").textContent = item.exterieur ? "Extérieur" : "Intérieur";
  $("#observationText").textContent =
    (item.observation || "").trim() || "Aucune observation pour le moment.";
  $("#observationDialog").showModal();
}

function safeFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

async function uploadPhoto(file) {
  const ext = file.name.split(".").pop() || "jpg";
  const base = safeFileName($("#nom").value || "araignee").replace(/\.[^.]+$/, "");
  const path = base + "-" + Date.now() + "." + ext;

  const { error } = await client.storage
    .from("araignees")
    .upload(path, file, { upsert: false });

  if (error) throw error;
  return path;
}

$("#editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#editMessage").textContent = "";

  try {
    let photoPath = currentPhotoPath;
    const file = $("#photo").files[0];

    if (file) {
      photoPath = await uploadPhoto(file);
    }

    const payload = {
      nom: $("#nom").value.trim(),
      emplacement: $("#emplacement").value.trim(),
      exterieur: $("#exterieur").checked,
      observation: $("#observation").value.trim() || null,
      photo_path: photoPath,
    };

    const query = editingId
      ? client.from("araignees").update(payload).eq("id", editingId)
      : client.from("araignees").insert(payload);

    const { error } = await query;
    if (error) throw error;

    if (editingId && file && currentPhotoPath && currentPhotoPath !== photoPath) {
      await client.storage.from("araignees").remove([currentPhotoPath]);
    }

    $("#editDialog").close();
    resetEdit();
    await load();
  } catch (err) {
    $("#editMessage").textContent = err.message || "Erreur lors de l’enregistrement.";
  }
});

async function removeItem(item) {
  if (!confirm('Supprimer "' + item.nom + '" du registre ?')) return;

  const { error } = await client
    .from("araignees")
    .delete()
    .eq("id", item.id);

  if (error) {
    alert(error.message);
    return;
  }

  if (item.photo_path) {
    await client.storage.from("araignees").remove([item.photo_path]);
  }

  await load();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginMessage").textContent = "";

  const { data, error } = await client.auth.signInWithOtp({
    email: $("#email").value.trim(),
    options: {
      emailRedirectTo: window.location.href.split("#")[0],
      shouldCreateUser: false
    }
  });

  if (error) {
    $("#loginMessage").textContent = "Connexion impossible : " + error.message;
    return;
  }

  $("#loginMessage").style.color = "#236b2d";
  $("#loginMessage").textContent = "Lien envoyé. Ouvre ton email pour te connecter.";
});

$("#loginBtn").onclick = () => {
  $("#loginMessage").style.color = "";
  $("#loginMessage").textContent = "";
  $("#loginDialog").showModal();
};

$("#logoutBtn").onclick = async () => {
  await client.auth.signOut();
  session = null;
  setAdminUI();
};

$("#addBtn").onclick = () => openEdit();
$("#refreshBtn").onclick = load;
$("#search").addEventListener("input", render);

$("#photo").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  $("#preview").innerHTML = '<img src="' + url + '" alt="Aperçu">';
});

document.querySelectorAll("[data-close]").forEach((b) => {
  b.onclick = () => document.getElementById(b.dataset.close).close();
});

(async () => {
  const { data } = await client.auth.getSession();
  session = data.session;
  setAdminUI();
  await load();

  client.auth.onAuthStateChange((_event, s) => {
    session = s;
    setAdminUI();
    load();
  });
})();