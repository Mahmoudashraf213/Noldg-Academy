export class ApiFeature {
    // Keep the query and request filters together for chainable operations.
    constructor(mongooseQuery, queryData) {
      this.mongooseQuery = mongooseQuery; 
      this.queryData = queryData; 
    }
  
    /**
     * Handles pagination
     */
    pagination() {
      let page = Number.parseInt(this.queryData.page, 10);
      let size = Number.parseInt(this.queryData.size, 10);
      if (!Number.isInteger(page) || page < 1) page = 1;
      if (!Number.isInteger(size) || size < 1) size = 10;
      size = Math.min(size, 100);
      const skip = (page - 1) * size;
      this.mongooseQuery.skip(skip).limit(size);
      return this;
    }
  
    /**
     * Handles sorting
     */
    sort() {
      let { sort } = this.queryData;
      if (sort) {
        sort = sort.replaceAll(',', ' '); 
        this.mongooseQuery.sort(sort);
      }
      return this;
    }
  
    /**
     * Handles field selection
     */
    select() {
      let { select } = this.queryData;
      if (select) {
        select = select.replaceAll(',', ' ');
        this.mongooseQuery.select(select);
      }
      return this;
    }
  
    /**
     * Handles filtering
     */
    filter() {
      let { page, size, sort, select, ...filter } = this.queryData; 
      filter = JSON.parse(
        JSON.stringify(filter).replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`)
      );
      this.mongooseQuery.find(filter);
      return this;
    }
  }
   
