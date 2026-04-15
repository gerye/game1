import { COLOR_COUNT_OPTIONS, COMPLEXITY_LABELS, SYMMETRY_LABELS } from "./rule-tables.js";
import { formatSkillDescription, formatSkillValueSummary } from "./game-data.js";

const TEXT = {
  avatar: "头像",
  brand: "品牌",
  name: "名字",
  displayName: "显示名",
  baseCode: "基础编码",
  primaryColor: "主色 / 结果",
  bloodline: "血脉",
  metrics: "可调指标",
  actions: "操作",
  flourish: "华丽度",
  potential: "潜力",
  saveBase: "保存基础项",
  deleteBase: "删除基础角色",
  emptySkillDb: "技能数据库为空。",
  skillCount: "当前技能总数",
  skill: "技能",
  equipment: "装备",
  equipmentCount: "当前装备总数",
  role: "角色类型",
  values: "数值",
  slot: "部位",
  range: "射程",
  edit: "修改",
  del: "删除",
  emptyEventDb: "事件数据库为空。",
  eventCount: "当前事件总数",
  event: "事件",
  type: "类型",
  weight: "权重",
  desc: "描述",
  emptyEquipmentDb: "装备数据库为空。",
  emptyStatusDb: "战斗状态数据库为空。",
  emptyBloodlineDb: "血脉数据库为空。",
  statusCount: "当前状态总数",
  status: "状态",
  duration: "持续",
  trigger: "触发型",
  holder: "当前传承者",
  candidate: "候选进度",
  buff: "正面",
  debuff: "负面",
  none: "无",
  allRoles: "近战 / 远射 / 法术",
  byRole: "按职业",
  readOnlyHint: "事件库当前为只读展示，请直接修改事件模板文件。",
  systemBuiltin: "系统内置"
};

function formatCountLine(label, count) {
  return `<p class="mini-text">${label}：${count}</p>`;
}

function renderCandidateText(candidates = [], escapeHtml) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return TEXT.none;
  }
  return candidates
    .map((candidate) => `${escapeHtml(candidate.displayName)}(${candidate.progress})`)
    .join("<br>");
}

export function renderCharacterDatabase({ container, entries, escapeHtml, getBaseBrand, getBaseName, bloodlines = [], factions = [], gradeColor }) {
  const bloodlineHolderById = new Map(
    entries
      .filter((entry) => entry.progress?.bloodlineId)
      .map((entry) => [entry.progress.bloodlineId, entry.base.code])
  );

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${TEXT.avatar}</th>
          <th>${TEXT.brand}</th>
          <th>${TEXT.name}</th>
          <th>门派</th>
          <th>${TEXT.displayName}</th>
          <th>${TEXT.baseCode}</th>
          <th>${TEXT.primaryColor}</th>
          <th>${TEXT.bloodline}</th>
          <th>${TEXT.metrics}</th>
          <th>${TEXT.actions}</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((entry) => `
          <tr data-base-row="${entry.base.code}">
            <td><img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}"></td>
            <td><input class="db-inline-input" data-field="brand" value="${escapeHtml(getBaseBrand(entry.base))}" placeholder="${TEXT.brand}"></td>
            <td><input class="db-inline-input" data-field="name" value="${escapeHtml(getBaseName(entry.base))}" placeholder="${TEXT.name}"></td>
            <td>
              <select class="db-inline-input metric-input" data-field="factionKey">
                ${factions.map((faction) => `<option value="${faction.key}" ${entry.build?.faction?.key === faction.key ? "selected" : ""}>${escapeHtml(faction.name)}</option>`).join("")}
              </select>
            </td>
            <td><strong style="color:${gradeColor(entry.build?.potential || "E")}">${escapeHtml(entry.displayName)}</strong></td>
            <td>${entry.base.code}</td>
            <td>
              ${entry.base.dominantColor}
              <br><span class="mini-text">${TEXT.flourish} ${entry.build?.potentialScore ?? "-"}</span>
              <br><span class="mini-text">${TEXT.potential} ${entry.build?.potential ?? "-"}</span>
            </td>
            <td>
              <select class="db-inline-input metric-input" data-field="bloodlineId">
                <option value="">${TEXT.none}</option>
                ${bloodlines.map((bloodline) => {
                  const holderCode = bloodlineHolderById.get(bloodline.id) || "";
                  const locked = holderCode && holderCode !== entry.base.code;
                  const selected = entry.progress?.bloodlineId === bloodline.id;
                  return `<option value="${bloodline.id}" ${selected ? "selected" : ""} ${locked ? "disabled" : ""}>${escapeHtml(`${bloodline.symbol || ""}${bloodline.name} (${bloodline.grade})`)}</option>`;
                }).join("")}
              </select>
            </td>
            <td>
              <select class="db-inline-input metric-input" data-field="colorCountScore">
                ${COLOR_COUNT_OPTIONS.map((option) => `<option value="${option.value}" ${Number(entry.base.metrics?.colorCountScore ?? 1) === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
              </select>
              <select class="db-inline-input metric-input" data-field="patternComplexityTier">
                ${COMPLEXITY_LABELS.map((label, index) => `<option value="${index}" ${Number(entry.base.metrics?.patternComplexityTier ?? 0) === index ? "selected" : ""}>${label}</option>`).join("")}
              </select>
              <select class="db-inline-input metric-input" data-field="patternSymmetryTier">
                ${SYMMETRY_LABELS.map((label, index) => `<option value="${index}" ${Number(entry.base.metrics?.patternSymmetryTier ?? 0) === index ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </td>
            <td>
              <button class="tiny-btn alt" data-action="save-base-meta" data-id="${entry.base.code}">${TEXT.saveBase}</button>
              <button class="tiny-btn" data-action="delete-base" data-id="${entry.base.code}">${TEXT.deleteBase}</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function renderBloodlineDatabase({ container, bloodlines, holders, candidateMap = new Map(), escapeHtml, gradeColor }) {
  const sorted = [...bloodlines].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  if (sorted.length === 0) {
    container.innerHTML = `<p class="warning-text">${TEXT.emptyBloodlineDb}</p>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${TEXT.bloodline}</th>
          <th>${TEXT.potential}</th>
          <th>${TEXT.status}</th>
          <th>${TEXT.skill}</th>
          <th>${TEXT.holder}</th>
          <th>${TEXT.candidate}</th>
          <th>${TEXT.desc}</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((bloodline) => `
          <tr>
            <td><strong style="color:${gradeColor(bloodline.grade)}">${escapeHtml(`${bloodline.symbol || ""}${bloodline.name}`)}</strong></td>
            <td><span style="color:${gradeColor(bloodline.grade)}">${bloodline.grade}</span></td>
            <td>${escapeHtml(bloodline.statusName || bloodline.statusId || "-")}</td>
            <td><span style="color:${gradeColor(bloodline.grade || "E")}">${escapeHtml(bloodline.skillId || "-")}</span></td>
            <td>${escapeHtml(holders?.get?.(bloodline.id) || TEXT.none)}</td>
            <td>${bloodline.grade === "SSS" && !holders?.get?.(bloodline.id)
              ? renderCandidateText(candidateMap.get(bloodline.id) || [], escapeHtml)
              : TEXT.none}</td>
            <td>${escapeHtml(bloodline.desc || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function renderSkillDatabase({ container, skills, escapeHtml, roleLabels, gradeColor }) {
  const familyRows = Array.from(
    skills.reduce((map, skill) => {
      if (!skill.familyId) return map;
      if (!map.has(skill.familyId) || skill.grade === "E") {
        map.set(skill.familyId, skill);
      }
      return map;
    }, new Map()).values()
  ).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

  if (familyRows.length === 0) {
    container.innerHTML = `<p class="warning-text">${TEXT.emptySkillDb}</p>`;
    return;
  }

  container.innerHTML = `
    ${formatCountLine(TEXT.skillCount, familyRows.length)}
    <table>
      <thead>
        <tr>
          <th>${TEXT.skill}</th>
          <th>${TEXT.role}</th>
          <th>${TEXT.potential}</th>
          <th>${TEXT.values}</th>
          <th>${TEXT.actions}</th>
        </tr>
      </thead>
      <tbody>
        ${familyRows.map((skill) => `
          <tr>
            <td>
              <strong style="color:${gradeColor("E")}">${escapeHtml(skill.name.replace(/(SSS|SS|S|A|B|C|D|E)$/u, ""))}</strong>
              <br><span class="mini-text">${escapeHtml(formatSkillDescription(skill))}</span>
            </td>
            <td>${skill.role === "all" ? TEXT.allRoles : roleLabels[skill.role]}</td>
            <td><span style="color:${gradeColor("E")}">E ~ SSS</span></td>
            <td>
              ${escapeHtml(formatSkillValueSummary(skill))}
              <br><span class="mini-text">CD ${skill.cooldown}s | ${TEXT.range} ${skill.role === "all" ? TEXT.byRole : skill.range}</span>
            </td>
            <td>
              <button class="tiny-btn alt" data-action="edit-skill-family" data-family-id="${skill.familyId}">${TEXT.edit}</button>
              <button class="tiny-btn" data-action="delete-skill-family" data-family-id="${skill.familyId}">${TEXT.del}</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function renderEquipmentDatabase({ container, equipment, escapeHtml, roleLabels, gradeColor, slotLabels }) {
  const gradeOrder = ["E", "D", "C", "B", "A", "S", "SS", "SSS"];
  const sortedEquipment = [...equipment].sort((left, right) =>
    gradeOrder.indexOf(right.grade) - gradeOrder.indexOf(left.grade) ||
    left.slot.localeCompare(right.slot) ||
    left.name.localeCompare(right.name, "zh-CN")
  );

  if (sortedEquipment.length === 0) {
    container.innerHTML = `<p class="warning-text">${TEXT.emptyEquipmentDb}</p>`;
    return;
  }

  container.innerHTML = `
    ${formatCountLine(TEXT.equipmentCount, sortedEquipment.length)}
    <table>
      <thead>
        <tr>
          <th>${TEXT.equipment}</th>
          <th>${TEXT.slot}</th>
          <th>${TEXT.role}</th>
          <th>${TEXT.potential}</th>
          <th>${TEXT.desc}</th>
        </tr>
      </thead>
      <tbody>
        ${sortedEquipment.map((item) => `
          <tr>
            <td><img class="avatar" src="${item.iconDataUrl}" alt="${escapeHtml(item.name)}"><br><strong style="color:${gradeColor(item.grade)}">${escapeHtml(item.name)}</strong></td>
            <td>${escapeHtml(slotLabels[item.slot] || item.slot)}</td>
            <td>${(item.allowedRoles || []).map((role) => roleLabels[role]).join(" / ")}</td>
            <td><span style="color:${gradeColor(item.grade)}">${item.grade}</span></td>
            <td>${escapeHtml(item.desc || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function renderEventDatabase({ container, events, escapeHtml }) {
  const sortedEvents = [...events].sort((left, right) => (right.weight || 0) - (left.weight || 0));
  if (sortedEvents.length === 0) {
    container.innerHTML = `<p class="warning-text">${TEXT.emptyEventDb}</p>`;
    return;
  }

  container.innerHTML = `
    ${formatCountLine(TEXT.eventCount, sortedEvents.length)}
    <p class="mini-text">${TEXT.readOnlyHint}</p>
    <table>
      <thead>
        <tr>
          <th>${TEXT.event}</th>
          <th>${TEXT.type}</th>
          <th>${TEXT.weight}</th>
          <th>${TEXT.desc}</th>
        </tr>
      </thead>
      <tbody>
        ${sortedEvents.map((event) => `
          <tr>
            <td><strong>${escapeHtml(event.name)}</strong></td>
            <td>${escapeHtml(event.type)}</td>
            <td>${Math.round(event.weight || 0)}</td>
            <td>${escapeHtml(event.desc || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function renderStatusDatabase({ container, statuses, escapeHtml }) {
  const sortedStatuses = [...statuses].sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name, "zh-CN"));
  if (sortedStatuses.length === 0) {
    container.innerHTML = `<p class="warning-text">${TEXT.emptyStatusDb}</p>`;
    return;
  }

  container.innerHTML = `
    ${formatCountLine(TEXT.statusCount, sortedStatuses.length)}
    <table>
      <thead>
        <tr>
          <th>${TEXT.status}</th>
          <th>${TEXT.type}</th>
          <th>${TEXT.duration}</th>
          <th>${TEXT.desc}</th>
          <th>${TEXT.actions}</th>
        </tr>
      </thead>
      <tbody>
        ${sortedStatuses.map((status) => `
          <tr>
            <td><strong>${escapeHtml(status.name)}</strong></td>
            <td>${status.kind === "buff" ? TEXT.buff : TEXT.debuff}</td>
            <td>${Number(status.duration || 0) > 0 ? `${status.duration}s` : TEXT.trigger}</td>
            <td>${escapeHtml(status.desc || "")}</td>
            <td>
              <button class="tiny-btn alt" data-action="edit-status" data-id="${status.id}">${TEXT.edit}</button>
              ${status.source === "system"
                ? `<span class="mini-text">${TEXT.systemBuiltin}</span>`
                : `<button class="tiny-btn" data-action="delete-status" data-id="${status.id}">${TEXT.del}</button>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
