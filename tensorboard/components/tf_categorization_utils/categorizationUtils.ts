/* Copyright 2017 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
import * as _ from 'lodash';
import {Experiment, getTags, Run} from '../tf_backend';
import {compareTagNames} from '../vz_sorting/sorting';
import {TagInfo} from '../../components/tf_utils/utils';

export type RunToTag = {
  [run: string]: string[];
};

export type RunTagInfo = {
  [run: string]: {
    [tag: string]: TagInfo;
  };
};

export enum CategoryType {
  SEARCH_RESULTS,
  PREFIX_GROUP,
}
export interface PrefixGroupMetadata {
  type: CategoryType.PREFIX_GROUP;
}
export interface SearchResultsMetadata {
  type: CategoryType.SEARCH_RESULTS;
  compositeSearch?: boolean;
  validRegex: boolean;
  universalRegex: boolean; // is the search query ".*"? ("(?:)" doesn't count)
}
export type CategoryMetadata = PrefixGroupMetadata | SearchResultsMetadata;
export interface Category<T> {
  name: string;
  metadata: CategoryMetadata;
  items: T[];
}
export type TagCategory = Category<{
  tag: string;
  runs: string[];
}>;
export type RunTagCategory = Category<{
  tag: string;
  run: string;
}>;
export type Series = {
  experiment: Experiment;
  run: string;
  tag: string;
};
/**
 * Organize data by tagPrefix, tag, then list of series which is comprised of
 * an experiment and a run.
 */
export type SeriesCategory = Category<{
  tag: string;
  series: Series[];
}>;
export type RawCategory = Category<string>; // Intermediate structure.
/**
 * Compute a category containing the search results for the given query.
 */
export function categorizeBySearchQuery(
  xs: string[],
  query: string
): RawCategory {
  const re = (() => {
    try {
      return new RegExp(query);
    } catch (e) {
      return null;
    }
  })();
  return {
    name: query,
    metadata: {
      type: CategoryType.SEARCH_RESULTS,
      validRegex: !!re,
      universalRegex: query === '.*',
    },
    items: re ? xs.filter((x) => x.match(re)) : [],
  };
}
/**
 * Compute the quotient set $X/{\sim}$, where $a \sim b$ if $a$ and $b$
 * share a common `separator`-prefix. Order is preserved.
 */
export function categorizeByPrefix(
  xs: string[],
  separator = '/'
): RawCategory[] {
  const categories: RawCategory[] = [];
  const categoriesByName: {[name: string]: RawCategory} = {};
  xs.forEach((x) => {
    const index = x.indexOf(separator);
    const name = index >= 0 ? x.slice(0, index) : x;
    if (!categoriesByName[name]) {
      const category = {
        name,
        metadata: {type: CategoryType.PREFIX_GROUP} as PrefixGroupMetadata,
        items: [],
      };
      categoriesByName[name] = category;
      categories.push(category);
    }
    categoriesByName[name].items.push(x);
  });
  return categories;
}
/*
 * Compute the standard categorization of the given input, including
 * both search categories and prefix categories.
 */
export function categorize(xs: string[], query = ''): RawCategory[] {
  const byFilter = categorizeBySearchQuery(xs, query);
  const byPrefix = categorizeByPrefix(xs);
  return [byFilter, ...byPrefix];
}
export function categorizeTags(
  runToTag: RunToTag,
  selectedRuns: string[],
  query?: string
): TagCategory[] {
  const tags = getTags(runToTag);
  const categories = categorize(tags, query);
  const tagToRuns = createTagToRuns(_.pick(runToTag, selectedRuns));
  return categories.map(({name, metadata, items}) => ({
    name,
    metadata,
    items: items.map((tag) => ({
      tag,
      runs: (tagToRuns.get(tag) || []).slice(),
    })),
  }));
}
function createTagToRuns(runToTag: RunToTag): Map<string, string[]> {
  const tagToRun = new Map();
  Object.keys(runToTag).forEach((run) => {
    runToTag[run].forEach((tag) => {
      const runs = tagToRun.get(tag) || [];
      runs.push(run);
      tagToRun.set(tag, runs);
    });
  });
  return tagToRun;
}
function createRunToTagForPlugin(runs: Run[], pluginName: string): RunToTag {
  const runToTag: {[name: string]: string[]} = {};
  runs.forEach((run) => {
    runToTag[run.name] = run.tags
      .filter((tag) => tag.pluginName == pluginName)
      .map(({name}) => name);
  });
  return runToTag;
}

type TagRun = {
  tag: string;
  run: string;
};

function compareTagRun(a: TagRun, b: TagRun): number {
  const c = compareTagNames(a.tag, b.tag);
  if (c != 0) {
    return c;
  }
  return compareTagNames(a.run, b.run);
}
export function categorizeRunTagCombinations(
  runToTag: RunToTag,
  selectedRuns: string[],
  query?: string
): RunTagCategory[] {
  const tagCategories = categorizeTags(runToTag, selectedRuns, query);
  function explodeCategory(tagCategory: TagCategory): RunTagCategory {
    const items = _.flatten(
      tagCategory.items.map(({tag, runs}) => runs.map((run) => ({tag, run})))
    );
    items.sort(compareTagRun);
    return {
      name: tagCategory.name,
      metadata: tagCategory.metadata,
      items,
    };
  }
  return tagCategories.map(explodeCategory);
}
