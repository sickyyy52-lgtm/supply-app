function cleanDoc(doc) {
    if (!doc) return doc;
    const obj = typeof doc.toObject === 'function' ?
        doc.toObject({ versionKey: false }) :
        { ...doc };
    delete obj._id;
    delete obj.__v;
    return obj;
}

function cleanDocs(docs) {
    return docs.map(cleanDoc);
}

module.exports = {
    cleanDoc,
    cleanDocs
};
