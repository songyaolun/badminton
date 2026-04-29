// Activity type configuration shared across all pages
const ACTIVITY_TYPES = [
  {
    key: 'badminton',
    name: '羽毛球',
    icon: '🏸',
    desc: '场地预约 · 组队打球',
    fields: [
      { key: 'court_count', label: '场地数量', type: 'number', placeholder: '如：2', unit: '片' },
      { key: 'level_req',   label: '水平要求', type: 'text',   placeholder: '不限 / 初级 / 中级 / 高级' },
      { key: 'equipment',   label: '装备说明', type: 'text',   placeholder: '如：需自备球拍' },
    ],
  },
  {
    key: 'basketball',
    name: '篮球',
    icon: '🏀',
    desc: '半场全场 · 组队斗牛',
    fields: [
      { key: 'half_full',  label: '半场/全场', type: 'select', options: ['半场', '全场'] },
      { key: 'team_size',  label: '队伍人数', type: 'text',   placeholder: '如：5v5' },
      { key: 'level_req',  label: '水平要求', type: 'text',   placeholder: '不限 / 业余 / 专业' },
    ],
  },
  {
    key: 'murder_mystery',
    name: '剧本杀',
    icon: '🎭',
    desc: '推理解谜 · 角色扮演',
    fields: [
      { key: 'script_name', label: '剧本名称', type: 'text',   placeholder: '如：白鹿书院' },
      { key: 'script_type', label: '剧本类型', type: 'text',   placeholder: '如：情感 / 推理 / 恐怖' },
      { key: 'has_dm',      label: '是否有DM', type: 'select', options: ['有DM', '无需DM', '待定'] },
      { key: 'duration',    label: '预计时长', type: 'text',   placeholder: '如：4小时' },
    ],
  },
  {
    key: 'board_games',
    name: '桌游',
    icon: '🎲',
    desc: '益智策略 · 休闲娱乐',
    fields: [
      { key: 'game_list',    label: '游戏清单',   type: 'text',   placeholder: '如：卡坦岛、UNO' },
      { key: 'with_teaching',label: '是否教学',   type: 'select', options: ['有教学', '无教学'] },
      { key: 'bring_games',  label: '是否自带游戏', type: 'select', options: ['需要自带', '不用自带'] },
    ],
  },
  {
    key: 'other',
    name: '其他',
    icon: '🎯',
    desc: '自定义活动类型',
    fields: [
      { key: 'custom_note', label: '活动说明', type: 'textarea', placeholder: '请描述活动内容...' },
    ],
  },
];

function getActivityType(key) {
  return ACTIVITY_TYPES.find(t => t.key === key) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
}
