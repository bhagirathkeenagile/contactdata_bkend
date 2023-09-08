# Whats Where

### For authentication there is an decorator in `src/auth.decorator.ts`

This uses an encrypted value from frontend, with api key and embeded with accountId

### Usage :

If user is not logged in then this will throw an error.

```js
 @Post('score')
  async scorePost(@Auth() accountId: string) {
    // this auth
    return accountId;
  }
```

### All the best @Bhagirath
