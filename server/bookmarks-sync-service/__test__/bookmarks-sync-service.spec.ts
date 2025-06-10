import { expect } from 'chai';
import { eq } from 'drizzle-orm';
import { FakeXServer } from './fake-x-server';
import { xCredentials, bookmarks, users } from '@shared/schema';
import { createDb } from './create-db';
import { XService } from 'server/lib/x-service';
import { DatabaseStorage } from 'server/storage';
import { AIProcessorService } from 'server/lib/ai-processor-service';
import { BookmarkService } from 'server/lib/bookmark-service';
import { ContentProcessor } from 'server/lib/content-processor';
import { v4 as uuidV4 } from 'uuid';

describe('X.com Bookmarks Sync', () => {
  let testDb: Awaited<ReturnType<typeof createDb>>;
  let fakeXServer: FakeXServer;
  let xService: XService;
  const X_API_SERVER_PORT = 3001;
  const TEST_USER_ID = uuidV4();
  const TEST_X_USERNAME = 'testuser';
  const TEST_X_USER_ID = 'x-user-123';

  before(async () => {
    // Start fake X API server
    fakeXServer = new FakeXServer(X_API_SERVER_PORT);
    await fakeXServer.start();

    testDb = await createDb();
    const xApiBaseUrl = `http://localhost:${X_API_SERVER_PORT}`;
    const storage = new DatabaseStorage(testDb);
    const contentProcessor = new ContentProcessor('');
    const bookmarkService = new BookmarkService(storage, contentProcessor);
    const aiProcessorService = new AIProcessorService(testDb, bookmarkService);
    xService = new XService(testDb, storage, aiProcessorService, bookmarkService, xApiBaseUrl);

    // Create a test user
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashed_password',
      email_verified: true
    });

    // Set up test user credentials
    await testDb.insert(xCredentials).values({
      user_id: TEST_USER_ID,
      x_user_id: TEST_X_USER_ID,
      x_username: TEST_X_USERNAME,
      access_token: 'test-token',
      refresh_token: 'test-refresh-token',
      token_expires_at: new Date(Date.now() + 3600000), // 1 hour from now
    });
  });

  after(async () => {
    await fakeXServer.stop();
  });

  beforeEach(async () => {
    // Clear any existing bookmarks before each test
    await testDb.delete(bookmarks).where(eq(bookmarks.user_id, TEST_USER_ID));
    fakeXServer.clear();
  });

  describe('syncBookmarks', () => {
    it('should sync bookmarks from X.com to database', async () => {
      // Set up test bookmarks in fake X server
      const testBookmarks = [
        {
          id: '1',
          text: 'Test bookmark 1',
          created_at: '2024-01-01T00:00:00Z',
          author_id: 'author-1',
          author_name: 'Author 1',
          author_username: 'testauthor1',
        },
        {
          id: '2',
          text: 'Test bookmark 2',
          created_at: '2024-01-02T00:00:00Z',
          author_id: 'author-2',
          author_name: 'Author 2',
          author_username: 'testauthor2',
        },
      ];

      fakeXServer.setUserBookmarks(TEST_X_USER_ID, TEST_X_USERNAME, testBookmarks);

      // Perform sync
      const result = await xService.syncBookmarks(TEST_USER_ID);

      // Verify results
      expect(result.added).to.equal(2);
      expect(result.updated).to.equal(0);
      expect(result.errors).to.equal(0);

      // Verify bookmarks were saved to database
      const savedBookmarks = await testDb
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.user_id, TEST_USER_ID));

      expect(savedBookmarks).to.have.length(2);
      expect(savedBookmarks[0].external_id).to.equal('1');
      expect(savedBookmarks[1].external_id).to.equal('2');
    });

  //   it('should handle empty bookmarks list', async () => {
  //     // Set up empty bookmarks list
  //     fakeXServer.setUserBookmarks(TEST_USER_ID, TEST_X_USERNAME, []);

  //     // Perform sync
  //     const result = await xService.syncBookmarks(TEST_USER_ID);

  //     // Verify results
  //     expect(result.added).to.equal(0);
  //     expect(result.updated).to.equal(0);
  //     expect(result.errors).to.equal(0);

  //     // Verify no bookmarks were saved
  //     const savedBookmarks = await testDb
  //       .select()
  //       .from(bookmarks)
  //       .where(eq(bookmarks.user_id, TEST_USER_ID));

  //     expect(savedBookmarks).to.have.length(0);
  //   });

  //   it('should handle X.com API errors gracefully', async () => {
  //     // Set up test bookmarks with an invalid one to trigger an error
  //     const testBookmarks = [
  //       {
  //         id: '1',
  //         text: 'Test bookmark 1',
  //         created_at: 'invalid-date', // This will cause an error
  //         author_id: '456',
  //         author_name: 'Test Author',
  //         author_username: 'testauthor',
  //       },
  //     ];

  //     fakeXServer.setUserBookmarks(TEST_USER_ID, TEST_X_USERNAME, testBookmarks);

  //     // Perform sync
  //     const result = await xService.syncBookmarks(TEST_USER_ID);

  //     // Verify results show the error was handled
  //     expect(result.errors).to.be.greaterThan(0);
  //     expect(result.added).to.equal(0);

  //     // Verify no bookmarks were saved
  //     const savedBookmarks = await testDb
  //       .select()
  //       .from(bookmarks)
  //       .where(eq(bookmarks.user_id, TEST_USER_ID));

  //     expect(savedBookmarks).to.have.length(0);
  //   });

  //   it('should update existing bookmarks with new engagement metrics', async () => {
  //     // First, create an existing bookmark
  //     await testDb.insert(bookmarks).values({
  //       user_id: TEST_USER_ID,
  //       external_id: '1',
  //       title: 'Existing Bookmark',
  //       url: 'https://x.com/test/1',
  //       source: 'x',
  //       created_at: new Date('2024-01-01T00:00:00Z'),
  //       like_count: 0,
  //       repost_count: 0,
  //       reply_count: 0,
  //       quote_count: 0,
  //     });

  //     // Set up test bookmarks with updated engagement metrics
  //     const testBookmarks = [
  //       {
  //         id: '1',
  //         text: 'Updated bookmark',
  //         created_at: '2024-01-01T00:00:00Z',
  //         author_id: '456',
  //         author_name: 'Test Author',
  //         author_username: 'testauthor',
  //         public_metrics: {
  //           like_count: 10,
  //           retweet_count: 5,
  //           reply_count: 2,
  //           quote_count: 1,
  //         },
  //       },
  //     ];

  //     fakeXServer.setUserBookmarks(TEST_USER_ID, TEST_X_USERNAME, testBookmarks);

  //     // Perform sync
  //     const result = await xService.syncBookmarks(TEST_USER_ID);

  //     // Verify results
  //     expect(result.added).to.equal(0);
  //     expect(result.updated).to.equal(1);
  //     expect(result.errors).to.equal(0);

  //     // Verify bookmark was updated
  //     const updatedBookmark = await testDb
  //       .select()
  //       .from(bookmarks)
  //       .where(and(
  //         eq(bookmarks.user_id, TEST_USER_ID),
  //         eq(bookmarks.external_id, '1')
  //       ))
  //       .then((rows: typeof bookmarks.$inferSelect[]) => rows[0]);

  //     expect(updatedBookmark.like_count).to.equal(10);
  //     expect(updatedBookmark.repost_count).to.equal(5);
  //     expect(updatedBookmark.reply_count).to.equal(2);
  //     expect(updatedBookmark.quote_count).to.equal(1);
  //   });
  });
}); 