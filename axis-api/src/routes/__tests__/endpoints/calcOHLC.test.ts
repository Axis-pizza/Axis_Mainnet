import { calcOHLC } from '../../return_ep.js';
import { mockData_01 } from './mockData/mockData_01.js';
import { mockData_02 } from './mockData/mockData_02.js';
import { mockData_03 } from './mockData/mockData_03.js';

describe('calcOHLC', () => {
    // test.1 正常時：toで指定された時刻から24時間前までのデータを返す
    test('toで指定した時刻までのデータ', () => {
        // to=1/2 14:00 → 24時間前=1/1 14:00にデータが存在する
        // 1/1 14:00 ~ 1/2 14:00の48本がすべて返る
        const to = new Date('2026-01-02T14:00:00Z').getTime() / 1000;
        const result = calcOHLC(mockData_01, to);
        expect(result!.length).toBe(48)
        // 先頭のデータ
        expect(result![0]).toEqual({
            datetime: "2026-01-01T14:00:00.000Z",
            O: 46.456,
            H: 47.789,
            L: 43.012,
            C: 43.901,
        });
        // 最後のデータ
        expect(result![47]).toEqual({
            datetime: "2026-01-02T14:00:00.000Z",
            O: 44.456,
            H: 47.345,
            L: 43.678,
            C: 46.901,
        });
    });

    // test.2 データにない日付を指定するとnull
    test('データ範囲外を指定するとnull', () => {
        // to=12/31 → データなし → null
        const to = new Date('2025-12-31T00:00:00Z').getTime() / 1000;
        const result = calcOHLC(mockData_01, to);
        expect(result).toBeNull();
    });


    // test.3 途中からのデータの場合、取得できている分だけデータを返す
    test('途中から始まる場合、取得できた分だけデータを返す', () => {
        // 1/2 0:00までのデータを取得する
        // to=1/2 00:00 → 24時間前=1/1 00:00にデータなし
        // 1/1の12:00 ~ 1/2の00:00までのデータを返す
        const to = new Date('2026-01-02T00:00:00Z').getTime() / 1000;
        const result = calcOHLC(mockData_01, to);
        // 先頭のデータ
        expect(result![0]).toEqual({
            datetime: "2026-01-01T12:00:00.000Z",
            O: 45.000,
            H: 46.543,
            L: 44.212,
            C: 44.212,
        });
        // 最後のデータ
        expect(result![23]).toEqual({
            datetime: "2026-01-02T00:00:00.000Z",
            O: 44.890,
            H: 48.123,
            L: 44.890,
            C: 45.345,
        });
    });


    // test.4 未来の日付を選択した場合、その時刻から24時間前までのデータのうち、存在するもののみを返す
    test('未来の日付を指定した場合、24時間前までの中で存在するもののみを返す', () => {
        // to=1/3 00:00 → 24時間前=1/2 00:00にデータが存在する
        // 1/2の 00:00 ~ 14:00 までのデータを返す
        const to = new Date('2026-01-03T00:00:00Z').getTime() / 1000;
        const result = calcOHLC(mockData_01, to);
        // 先頭のデータ
        expect(result![0]).toEqual({
            datetime: "2026-01-02T00:00:00.000Z",
            O: 44.456,
            H: 47.345,
            L: 43.678,
            C: 46.901,
        });
        // 最後のデータ
        expect(result![13]).toEqual({
            datetime: "2026-01-02T14:00:00.000Z",
            O: 44.456,
            H: 47.345,
            L: 43.678,
            C: 46.901,
        });
    });

    // test.5 30分間全てのindex_priceが欠損している場合、その時刻のデータはスキップされる
    test('30分間全てのindex_priceがない場合、その時刻データはスキップ', () => {
        // to=1/2 14:00 → 24時間前=1/1 14:00にデータが存在する
        // 1/1の14:00 ~ 1/2の14:00までのデータを返すが、1/1の18:00~18:55が欠損
        const to = new Date('2026-01-02T14:00:00Z').getTime() / 1000;
        const result = calcOHLC(mockData_02, to);
        // 18:00と18:30のキャンドルがスキップされ46本になる
        expect(result!.length).toBe(46);
        expect(result![11]).toEqual({
            datetime: "2026-01-01T17:30:00.000Z",
            O: 44.012,
            H: 47.901,
            L: 42.678,
            C: 46.567,
        });
        // 18:00, 18:30のデータはスキップされる
        expect(result![12]).toEqual({
            datetime: "2026-01-01T19:00:00.000Z",
            O: 43.456,
            H: 48.345,
            L: 43.456,
            C: 43.901,
        });
    });

    // test.6 index_priceに欠損がある場合、その状態のデータでOHLCを返す
    test('一部index_priceに欠損がある場合', () => {
        // to=1/2 14:00 → [1/1 14:00, 1/2 14:00) の48本
        // 18:15と18:20のみ欠損 → 18:00キャンドルはスキップされず48本になる
        const to = new Date('2026-01-02T14:00:00Z').getTime() / 1000;
        const result = calcOHLC(mockData_03, to);
        expect(result!.length).toBe(48);
        // 18:00キャンドルは4点のデータ(18:00, 18:05, 18:10, 18:25)で計算される
        expect(result![8]).toEqual({
            datetime: "2026-01-01T18:00:00.000Z",
            O: 44.890,
            H: 48.123,
            L: 44.890,
            C: 45.345,
        });
    });
});