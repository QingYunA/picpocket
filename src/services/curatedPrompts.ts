import type { PromptItem } from '../types';

export const PICPOCKET_CURATED_PROMPTS: PromptItem[] = [
  {
    id: 'pp-curated-001',
    sourceId: 'picpocket-curated',
    category: '肖像摄影',
    title: '赛博雨夜霓虹机能肖像',
    prompt:
      'A cinematic medium close-up portrait of an East Asian woman with cybernetic gold accents under pouring rain, illuminated by blue and amber neon signs, 35mm f/1.4 lens, shallow depth of field, natural skin texture, cinematic moody atmospheric lighting, photorealistic 8k.',
    coverUrl:
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    referenceImageUrls: [
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=80',
    ],
    tags: ['赛博朋克', '人像摄影', '霓虹光影', '雨夜'],
    author: 'PicPocket Studio',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    imageModel: 'FLUX.1-schnell',
    imageSize: '1024x1024',
    blocks: {
      subject: ['东亚女性肖像', '微型金色机械植入体', '雨丝浸润发丝'],
      style: ['电影级写实摄影', '35mm 胶片质感', '浅景深虚化'],
      lighting: ['琥珀橙与钴蓝双色霓虹', '雨夜倒影反光', '柔和边缘轮廓光'],
      composition: ['中近景胸像机位', '三分构图', '水滴散景虚化背景'],
    },
  },
  {
    id: 'pp-curated-002',
    sourceId: 'picpocket-curated',
    category: '商业静物',
    title: '极简北欧陶瓷哑光美学',
    prompt:
      'High-end minimalist commercial product photography of matte beige handcrafted ceramic vases on textured travertine stone pedestals, soft diffused morning sunlight from window, warm cast shadows, neutral earthy palette, clean Scandinavian interior backdrop, architectural digest style.',
    coverUrl:
      'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=600&auto=format&fit=crop&q=80',
    referenceImageUrls: [
      'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=1000&auto=format&fit=crop&q=80',
    ],
    tags: ['极简设计', '商业摄影', '北欧风', '静物'],
    author: 'PicPocket Studio',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    imageModel: 'grok-imagine',
    imageSize: '1024x1024',
    blocks: {
      subject: ['手工米色陶瓷花瓶', '洞石底座台面'],
      style: ['极简商业静物', '北欧性冷淡风', '高阶质感杂志大片'],
      lighting: ['柔和清晨漫射天光', '自然侧逆柔光', '暖调投影'],
      composition: ['正面平视中央构图', '几何块面错落', '大面积克制留白'],
    },
  },
  {
    id: 'pp-curated-003',
    sourceId: 'picpocket-curated',
    category: '二次元风景',
    title: '夏日新海诚铁道积雨云',
    prompt:
      'Anime scenery landscape by Makoto Shinkai, a rural Japanese railway crossing in sunny summer afternoon, towering massive cumulonimbus thunderhead clouds in vibrant azure sky, sparkling ocean in distance, high key saturated colors, sun flare and lens dust particles, anime masterpiece.',
    coverUrl:
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    referenceImageUrls: [
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=80',
    ],
    tags: ['二次元', '新海诚', '积雨云', '夏天', '铁道'],
    author: 'PicPocket Studio',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    imageModel: 'dall-e-3',
    imageSize: '1024x576',
    blocks: {
      subject: ['乡村平交铁道口', '巨型盛夏积雨云群', '远眺碧蓝海面'],
      style: ['新海诚画风', '日系纯净水彩光感', '高饱和动漫大作'],
      lighting: ['明朗正午日光', '逆光金色光晕边缘', '云层透光丁达尔'],
      composition: ['开阔广角俯视大景', '铁轨引导线构图', '天空占画面三分之二'],
    },
  },
  {
    id: 'pp-curated-004',
    sourceId: 'picpocket-curated',
    category: '3D 拟态',
    title: '超萌 3D 拟真黏土漂浮岛',
    prompt:
      'Cute 3D claymorphic miniature floating island isometric illustration, colorful soft clay textures, tiny pastel house with smoke from chimney, fluffy cotton clouds, plasticine pine trees, raytraced ambient occlusion, soft studio clay lighting, tilt-shift miniature toy effect, blender 3D render.',
    coverUrl:
      'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
    referenceImageUrls: [
      'https://images.unsplash.com/photo-1563089145-599997674d42?w=1000&auto=format&fit=crop&q=80',
    ],
    tags: ['3D渲染', '黏土风', '微缩模型', '可爱治愈'],
    author: 'PicPocket Studio',
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    imageModel: 'FLUX.1-schnell',
    imageSize: '1024x1024',
    blocks: {
      subject: ['微缩漂浮浮空岛屿', '马卡龙色黏土小屋', '棉花团白云'],
      style: ['Blender 黏土拟态 (Claymorphism)', '微缩移轴镜头 (Tilt-Shift)', '柔和磨砂塑料质感'],
      lighting: ['摄影棚三点柔光', '全局光线追踪光照 (GI)', '温和柔和阴影接触'],
      composition: ['等轴侧 45 度视角 (Isometric)', '居中微缩透视', '景深虚化'],
    },
  },
  {
    id: 'pp-curated-005',
    sourceId: 'picpocket-curated',
    category: '黑白胶片',
    title: '徕卡中画幅黑白雨夜街头',
    prompt:
      'High contrast black and white street photography by Fan Ho, a solitary figure with umbrella walking through narrow rainy alleyway, dramatic diagonal shafts of light piercing mist, deep rich blacks, textured film grain, Leica M6 with 50mm Summicron lens, timeless classic monograph.',
    coverUrl:
      'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop&q=80',
    referenceImageUrls: [
      'https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=1000&auto=format&fit=crop&q=80',
    ],
    tags: ['黑白摄影', '徕卡', '何藩风', '极简光影', '街头'],
    author: 'PicPocket Studio',
    createdAt: new Date(Date.now() - 18000000).toISOString(),
    imageModel: 'grok-imagine',
    imageSize: '1024x1024',
    blocks: {
      subject: ['撑伞独行的远景剪影', '湿漉的反光石板小径', '古朴高耸老街弄堂'],
      style: ['何藩大师构图', '黑白单色高反差胶片', '柯达 Tri-X 400 银盐颗粒'],
      lighting: ['穿透晨雾的斜向几何光柱', '极高动态范围纯黑纯白', '强烈明暗对照法 (Chiaroscuro)'],
      composition: ['极简几何对称透视', '单点透视纵深', '人物置于视觉焦点黄金分割点'],
    },
  },
];
