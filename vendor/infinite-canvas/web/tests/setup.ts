// Dexie 在模块加载时就读取全局 indexedDB，所以要在所有测试文件之前装好内存版实现，
// 否则只要有任何测试先间接引入了 @picpocket/db，之后的数据库测试都会因 IndexedDB 缺失而失败。
import "fake-indexeddb/auto";
