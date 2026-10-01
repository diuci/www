// 丢词大作战 — 诗句词库（小学一、二、三年级，统编版教材）
//
// 数据口径：
//   * lines 为**纯汉字，不含标点**（地面上排字用，标点在地面不好看）
//   * 《咏鹅》首句「鹅鹅鹅」拆为三个单字行，散排更好看
//   * grade 为年级（1/2/3），form 为体裁（五言/七言/杂言）
//   * pairs 为可配对的上下句下标对 [上句, 下句]，供"联句"判定使用
//   * 全部为唐宋及以前公版作品（另含汉乐府、北朝民歌、明清公版）
//
// 诗句内容以教材用字为准（树阴不作树荫、曈曈不作瞳瞳、淡妆不作浓妆）。

/** @typedef {{id:string,grade:number,title:string,author:string,dynasty:string,form:string,lines:string[],pairs:number[][]}} Poem */

/** @type {Poem[]} */
export const POEMS = [
  // ---------------------------------------------------------------- 一年级
  { id: 'yonge', grade: 1, title: '咏鹅', author: '骆宾王', dynasty: '唐', form: '五言',
    lines: ['鹅', '鹅', '鹅', '曲项向天歌', '白毛浮绿水', '红掌拨清波'], pairs: [[3, 4], [4, 5]] },
  { id: 'jiangnan', grade: 1, title: '江南', author: '汉乐府', dynasty: '汉', form: '杂言',
    lines: ['江南可采莲', '莲叶何田田', '鱼戏莲叶间', '鱼戏莲叶东', '鱼戏莲叶西', '鱼戏莲叶南', '鱼戏莲叶北'],
    pairs: [[0, 1], [1, 2]] },
  { id: 'hua', grade: 1, title: '画', author: '王维', dynasty: '唐', form: '五言',
    lines: ['远看山有色', '近听水无声', '春去花还在', '人来鸟不惊'], pairs: [[0, 1], [2, 3]] },
  { id: 'minnong2', grade: 1, title: '悯农其二', author: '李绅', dynasty: '唐', form: '五言',
    lines: ['锄禾日当午', '汗滴禾下土', '谁知盘中餐', '粒粒皆辛苦'], pairs: [[0, 1], [2, 3]] },
  { id: 'gulangyuexing', grade: 1, title: '古朗月行', author: '李白', dynasty: '唐', form: '五言',
    lines: ['小时不识月', '呼作白玉盘', '又疑瑶台镜', '飞在青云端'], pairs: [[0, 1], [2, 3]] },
  { id: 'feng', grade: 1, title: '风', author: '李峤', dynasty: '唐', form: '五言',
    lines: ['解落三秋叶', '能开二月花', '过江千尺浪', '入竹万竿斜'], pairs: [[0, 1], [2, 3]] },
  { id: 'chunxiao', grade: 1, title: '春晓', author: '孟浩然', dynasty: '唐', form: '五言',
    lines: ['春眠不觉晓', '处处闻啼鸟', '夜来风雨声', '花落知多少'], pairs: [[0, 1], [2, 3]] },
  { id: 'zengwanglun', grade: 1, title: '赠汪伦', author: '李白', dynasty: '唐', form: '七言',
    lines: ['李白乘舟将欲行', '忽闻岸上踏歌声', '桃花潭水深千尺', '不及汪伦送我情'], pairs: [[0, 1], [2, 3]] },
  { id: 'jingyesi', grade: 1, title: '静夜思', author: '李白', dynasty: '唐', form: '五言',
    lines: ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'], pairs: [[0, 1], [2, 3]] },
  { id: 'xunyinzhe', grade: 1, title: '寻隐者不遇', author: '贾岛', dynasty: '唐', form: '五言',
    lines: ['松下问童子', '言师采药去', '只在此山中', '云深不知处'], pairs: [[0, 1], [2, 3]] },
  { id: 'chishang', grade: 1, title: '池上', author: '白居易', dynasty: '唐', form: '五言',
    lines: ['小娃撑小艇', '偷采白莲回', '不解藏踪迹', '浮萍一道开'], pairs: [[0, 1], [2, 3]] },
  { id: 'xiaochi', grade: 1, title: '小池', author: '杨万里', dynasty: '宋', form: '七言',
    lines: ['泉眼无声惜细流', '树阴照水爱晴柔', '小荷才露尖尖角', '早有蜻蜓立上头'], pairs: [[0, 1], [2, 3]] },
  { id: 'huaji', grade: 1, title: '画鸡', author: '唐寅', dynasty: '明', form: '七言',
    lines: ['头上红冠不用裁', '满身雪白走将来', '平生不敢轻言语', '一叫千门万户开'], pairs: [[0, 1], [2, 3]] },
  { id: 'xiangsi', grade: 1, title: '相思', author: '王维', dynasty: '唐', form: '五言',
    lines: ['红豆生南国', '春来发几枝', '愿君多采撷', '此物最相思'], pairs: [[0, 1], [2, 3]] },

  // ---------------------------------------------------------------- 二年级
  { id: 'meihua', grade: 2, title: '梅花', author: '王安石', dynasty: '宋', form: '五言',
    lines: ['墙角数枝梅', '凌寒独自开', '遥知不是雪', '为有暗香来'], pairs: [[0, 1], [2, 3]] },
  { id: 'xiaoerchuidiao', grade: 2, title: '小儿垂钓', author: '胡令能', dynasty: '唐', form: '七言',
    lines: ['蓬头稚子学垂纶', '侧坐莓苔草映身', '路人借问遥招手', '怕得鱼惊不应人'], pairs: [[0, 1], [2, 3]] },
  { id: 'dengguanquelou', grade: 2, title: '登鹳雀楼', author: '王之涣', dynasty: '唐', form: '五言',
    lines: ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'], pairs: [[0, 1], [2, 3]] },
  { id: 'wanglushanpubu', grade: 2, title: '望庐山瀑布', author: '李白', dynasty: '唐', form: '七言',
    lines: ['日照香炉生紫烟', '遥看瀑布挂前川', '飞流直下三千尺', '疑是银河落九天'], pairs: [[0, 1], [2, 3]] },
  { id: 'jiangxue', grade: 2, title: '江雪', author: '柳宗元', dynasty: '唐', form: '五言',
    lines: ['千山鸟飞绝', '万径人踪灭', '孤舟蓑笠翁', '独钓寒江雪'], pairs: [[0, 1], [2, 3]] },
  { id: 'yesushansi', grade: 2, title: '夜宿山寺', author: '李白', dynasty: '唐', form: '五言',
    lines: ['危楼高百尺', '手可摘星辰', '不敢高声语', '恐惊天上人'], pairs: [[0, 1], [2, 3]] },
  { id: 'chilege', grade: 2, title: '敕勒歌', author: '北朝民歌', dynasty: '南北朝', form: '杂言',
    lines: ['敕勒川', '阴山下', '天似穹庐', '笼盖四野', '天苍苍', '野茫茫', '风吹草低见牛羊'],
    pairs: [[0, 1], [4, 5]] },
  { id: 'cunju', grade: 2, title: '村居', author: '高鼎', dynasty: '清', form: '七言',
    lines: ['草长莺飞二月天', '拂堤杨柳醉春烟', '儿童散学归来早', '忙趁东风放纸鸢'], pairs: [[0, 1], [2, 3]] },
  { id: 'yongliu', grade: 2, title: '咏柳', author: '贺知章', dynasty: '唐', form: '七言',
    lines: ['碧玉妆成一树高', '万条垂下绿丝绦', '不知细叶谁裁出', '二月春风似剪刀'], pairs: [[0, 1], [2, 3]] },
  { id: 'guyuancao', grade: 2, title: '赋得古原草送别', author: '白居易', dynasty: '唐', form: '五言',
    lines: ['离离原上草', '一岁一枯荣', '野火烧不尽', '春风吹又生',
            '远芳侵古道', '晴翠接荒城', '又送王孙去', '萋萋满别情'],
    pairs: [[0, 1], [2, 3], [4, 5], [6, 7]] },
  { id: 'jingcisi', grade: 2, title: '晓出净慈寺送林子方', author: '杨万里', dynasty: '宋', form: '七言',
    lines: ['毕竟西湖六月中', '风光不与四时同', '接天莲叶无穷碧', '映日荷花别样红'], pairs: [[0, 1], [2, 3]] },
  { id: 'jueju-huangli', grade: 2, title: '绝句', author: '杜甫', dynasty: '唐', form: '七言',
    lines: ['两个黄鹂鸣翠柳', '一行白鹭上青天', '窗含西岭千秋雪', '门泊东吴万里船'], pairs: [[0, 1], [2, 3]] },
  { id: 'minnong1', grade: 2, title: '悯农其一', author: '李绅', dynasty: '唐', form: '五言',
    lines: ['春种一粒粟', '秋收万颗子', '四海无闲田', '农夫犹饿死'], pairs: [[0, 1], [2, 3]] },
  { id: 'zhouyeshujian', grade: 2, title: '舟夜书所见', author: '查慎行', dynasty: '清', form: '五言',
    lines: ['月黑见渔灯', '孤光一点萤', '微微风簇浪', '散作满河星'], pairs: [[0, 1], [2, 3]] },

  // ---------------------------------------------------------------- 三年级
  { id: 'suojian', grade: 3, title: '所见', author: '袁枚', dynasty: '清', form: '五言',
    lines: ['牧童骑黄牛', '歌声振林樾', '意欲捕鸣蝉', '忽然闭口立'], pairs: [[0, 1], [2, 3]] },
  { id: 'shanxing', grade: 3, title: '山行', author: '杜牧', dynasty: '唐', form: '七言',
    lines: ['远上寒山石径斜', '白云生处有人家', '停车坐爱枫林晚', '霜叶红于二月花'], pairs: [[0, 1], [2, 3]] },
  { id: 'zengliujingwen', grade: 3, title: '赠刘景文', author: '苏轼', dynasty: '宋', form: '七言',
    lines: ['荷尽已无擎雨盖', '菊残犹有傲霜枝', '一年好景君须记', '正是橙黄橘绿时'], pairs: [[0, 1], [2, 3]] },
  { id: 'yeshusuojian', grade: 3, title: '夜书所见', author: '叶绍翁', dynasty: '宋', form: '七言',
    lines: ['萧萧梧叶送寒声', '江上秋风动客情', '知有儿童挑促织', '夜深篱落一灯明'], pairs: [[0, 1], [2, 3]] },
  { id: 'wangtianmenshan', grade: 3, title: '望天门山', author: '李白', dynasty: '唐', form: '七言',
    lines: ['天门中断楚江开', '碧水东流至此回', '两岸青山相对出', '孤帆一片日边来'], pairs: [[0, 1], [2, 3]] },
  { id: 'yinhushang', grade: 3, title: '饮湖上初晴后雨', author: '苏轼', dynasty: '宋', form: '七言',
    lines: ['水光潋滟晴方好', '山色空蒙雨亦奇', '欲把西湖比西子', '淡妆浓抹总相宜'], pairs: [[0, 1], [2, 3]] },
  { id: 'wangdongting', grade: 3, title: '望洞庭', author: '刘禹锡', dynasty: '唐', form: '七言',
    lines: ['湖光秋月两相和', '潭面无风镜未磨', '遥望洞庭山水翠', '白银盘里一青螺'], pairs: [[0, 1], [2, 3]] },
  { id: 'zaofabaidicheng', grade: 3, title: '早发白帝城', author: '李白', dynasty: '唐', form: '七言',
    lines: ['朝辞白帝彩云间', '千里江陵一日还', '两岸猿声啼不住', '轻舟已过万重山'], pairs: [[0, 1], [2, 3]] },
  { id: 'cailianqu', grade: 3, title: '采莲曲', author: '王昌龄', dynasty: '唐', form: '七言',
    lines: ['荷叶罗裙一色裁', '芙蓉向脸两边开', '乱入池中看不见', '闻歌始觉有人来'], pairs: [[0, 1], [2, 3]] },
  { id: 'jueju-chiri', grade: 3, title: '绝句', author: '杜甫', dynasty: '唐', form: '五言',
    lines: ['迟日江山丽', '春风花草香', '泥融飞燕子', '沙暖睡鸳鸯'], pairs: [[0, 1], [2, 3]] },
  { id: 'huichongchunjiang', grade: 3, title: '惠崇春江晚景', author: '苏轼', dynasty: '宋', form: '七言',
    lines: ['竹外桃花三两枝', '春江水暖鸭先知', '蒌蒿满地芦芽短', '正是河豚欲上时'], pairs: [[0, 1], [2, 3]] },
  { id: 'sanqudaozhong', grade: 3, title: '三衢道中', author: '曾几', dynasty: '宋', form: '七言',
    lines: ['梅子黄时日日晴', '小溪泛尽却山行', '绿阴不减来时路', '添得黄鹂四五声'], pairs: [[0, 1], [2, 3]] },
  { id: 'yuanri', grade: 3, title: '元日', author: '王安石', dynasty: '宋', form: '七言',
    lines: ['爆竹声中一岁除', '春风送暖入屠苏', '千门万户曈曈日', '总把新桃换旧符'], pairs: [[0, 1], [2, 3]] },
  { id: 'qingming', grade: 3, title: '清明', author: '杜牧', dynasty: '唐', form: '七言',
    lines: ['清明时节雨纷纷', '路上行人欲断魂', '借问酒家何处有', '牧童遥指杏花村'], pairs: [[0, 1], [2, 3]] },
  { id: 'jiuyuejiuri', grade: 3, title: '九月九日忆山东兄弟', author: '王维', dynasty: '唐', form: '七言',
    lines: ['独在异乡为异客', '每逢佳节倍思亲', '遥知兄弟登高处', '遍插茱萸少一人'], pairs: [[0, 1], [2, 3]] },
  { id: 'chuzhouxijian', grade: 3, title: '滁州西涧', author: '韦应物', dynasty: '唐', form: '七言',
    lines: ['独怜幽草涧边生', '上有黄鹂深树鸣', '春潮带雨晚来急', '野渡无人舟自横'], pairs: [[0, 1], [2, 3]] },
  { id: 'dalinsitaohua', grade: 3, title: '大林寺桃花', author: '白居易', dynasty: '唐', form: '七言',
    lines: ['人间四月芳菲尽', '山寺桃花始盛开', '长恨春归无觅处', '不知转入此中来'], pairs: [[0, 1], [2, 3]] },
];

/** 按 id 取诗 */
export const poemById = (id) => POEMS.find((p) => p.id === id) || null;

/** 某个年级的全部诗 */
export const poemsOfGrade = (grade) => POEMS.filter((p) => p.grade === grade);

/** 学段名（关卡分组用） */
export const GRADES = [
  { grade: 1, name: '小学一年级', short: '一年级' },
  { grade: 2, name: '小学二年级', short: '二年级' },
  { grade: 3, name: '小学三年级', short: '三年级' },
];

export const gradeName = (g) => (GRADES.find((x) => x.grade === g) || GRADES[0]).name;
