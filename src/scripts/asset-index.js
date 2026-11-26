// A browser-session snapshot shared by the existing audit window.
export const auditIndex = {groups: null};

export function filterAssetGroups(groups, invalidOnly = false, searchText = '', singularType = '') {
    return (groups ?? []).filter(group => !singularType || group.type === singularType)
        .map(group => ({type: group.type, assets: group.assets.filter(entry =>
            (!invalidOnly || !entry.isValid) && (!searchText ||
                [entry.name, entry.path, entry.parentName ?? ''].some(value => value.includes(searchText))))}));
}
